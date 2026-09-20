// Test rádce u pozemku (js/radce.js) — bez prohlížeče, na vymyšlených datech.
//
// Spuštění: node scripts/test-radce.mjs
//
// Rádce říká lidem, na co si dát pozor, než dají za pozemek statisíce.
// Proto se hlídá hlavně tohle:
//
//  · rady se řídí KONKRÉTNÍM pozemkem, ne jen druhem — dražba za tři dny
//    musí říct něco jiného než dražba za půl roku,
//  · prošlý termín se nepřipomíná (nic horšího než „zbývá −40 dní"),
//  · u podezřele levné nabídky se první otázka ptá na spoluvlastnický podíl,
//  · a hlavně: tmavá varianta (mapa) i světlá (stránka pozemku) počítají
//    obsah JEDNÍM voláním, takže si nemůžou protiřečit. Dřív to byly TŘI
//    samostatné kopie rad a přesně takhle se rozešel cenový verdikt.
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Oba soubory jsou prosté skripty, ne moduly — načteme je do globálu.
// Pořadí je důležité: rádce si bere druhGroup z cenového modelu.
new Function(readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8'))();
new Function(readFileSync(new URL('../js/radce.js', import.meta.url), 'utf8'))();
const { PK_CENY, PK_RADCE } = globalThis;
pravda('rádce se načetl', !!(PK_RADCE && PK_RADCE.rady), 'globální PK_RADCE chybí');

/** Datum posunuté o N dní od dneška, ve tvaru, v jakém ho mají data. */
function zaDni(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const klice = (r) => r.radky.map((x) => x.klic);

// --- 1) Rady se řídí druhem pozemku ----------------------------------
const orna = { place: 'A', okres: 'Kolín', type: 'sale', druh: 'orná půda', area: 5000, price: 200000 };
const les = { place: 'B', okres: 'Kolín', type: 'sale', druh: 'lesní pozemek', area: 5000, price: 200000 };
const stavebni = { place: 'C', okres: 'Kolín', type: 'sale', druh: 'stavební pozemek', area: 800, price: 1600000 };
pravda('u orné půdy se mluví o vynětí ze ZPF', /ZPF|zemědělského půdního fondu/.test(PK_RADCE.rady(orna).radky[0].txt));
pravda('u lesa se mluví o lesním zákoně', /lesního zákona/.test(PK_RADCE.rady(les).radky[0].txt));
pravda('u stavebního pozemku se připomínají sítě a příjezd', /sítě a příjezd/.test(PK_RADCE.rady(stavebni).radky[0].txt));

// --- 2) Termín dražby: naléhavost podle toho, kolik zbývá ------------
const brzy = { ...orna, type: 'drazba', extra: 'dražba ' + zaDni(3) };
const pozdeji = { ...orna, type: 'drazba', extra: 'dražba ' + zaDni(23) };
const daleko = { ...orna, type: 'drazba', extra: 'dražba ' + zaDni(120) };
const prosle = { ...orna, type: 'drazba', extra: 'dražba ' + zaDni(-40) };
const rBrzy = PK_RADCE.rady(brzy), rPozd = PK_RADCE.rady(pozdeji);
pravda('dražba za tři dny varuje, že je málo času',
  /málo času/.test((rBrzy.radky.find((x) => x.klic === 'Kolik zbývá času') || {}).txt || ''),
  JSON.stringify(klice(rBrzy)));
pravda('a je to označené jako varování',
  (rBrzy.radky.find((x) => x.klic === 'Kolik zbývá času') || {}).lvl === 'warn');
pravda('dražba za 23 dní zmíní počet dní, ale nestraší',
  /23 dní/.test((rPozd.radky.find((x) => x.klic === 'Kolik zbývá času') || {}).txt || '') &&
  (rPozd.radky.find((x) => x.klic === 'Kolik zbývá času') || {}).lvl === 'mid');
pravda('dražba za čtyři měsíce řádek o čase nemá',
  !klice(PK_RADCE.rady(daleko)).includes('Kolik zbývá času'));
// Tohle je ta nejtrapnější možná chyba: „do dražby zbývá −40 dní".
pravda('prošlý termín se vůbec nepřipomíná',
  !klice(PK_RADCE.rady(prosle)).includes('Kolik zbývá času'),
  'rádce počítá i zpětně — vyšlo by záporné číslo dní');

// --- 3) Výměra mluví jen tam, kde má co říct -------------------------
pravda('u malé parcely se řekne, že se hodí spíš k rozšíření sousedního',
  /rozšíření sousedního/.test((PK_RADCE.rady({ ...orna, area: 180 }).radky.find((x) => x.klic === 'Co znamená výměra') || {}).txt || ''));
pravda('u velké plochy se zmíní daň a pacht',
  /dan[íi] z nemovitých věcí|daní z nemovitých věcí/i.test((PK_RADCE.rady({ ...orna, area: 90000 }).radky.find((x) => x.klic === 'Co znamená výměra') || {}).txt || ''));
pravda('u běžné výměry se o ní nemluví vůbec',
  !klice(PK_RADCE.rady({ ...orna, area: 3000 })).includes('Co znamená výměra'),
  'rada o výměře se ukazuje i tam, kde není co říct');

// --- 4) Cena: rádce mluví TÝMŽ modelem jako cenový verdikt -----------
function pole(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
const BEZNE = pole(12, (i) => ({ place: 'S' + i, okres: 'Cheb', type: 'sale',
  druh: 'stavební pozemek', area: 1000, price: 2000000 }));
const PODIL = { place: 'Podíl', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek', area: 1000, price: 3000 };
const model = PK_CENY.postav([...BEZNE, PODIL]);
const rPodil = PK_RADCE.rady(PODIL, model);
pravda('u podezřele levné nabídky se mluví o spoluvlastnickém podílu',
  /spoluvlastnický podíl/.test((rPodil.radky.find((x) => x.klic === 'Co říká cena') || {}).txt || ''),
  JSON.stringify(klice(rPodil)));
pravda('a první otázka se ptá rovnou na to',
  /podíl/i.test(rPodil.otazky[0] || ''), JSON.stringify(rPodil.otazky));
pravda('u běžné nabídky se o podílu nemluví',
  !/podíl/i.test(JSON.stringify(PK_RADCE.rady(BEZNE[0], model))),
  'podíl se zmiňuje i tam, kde pro to není důvod');
pravda('bez cenového modelu se řádek o ceně prostě neukáže',
  !klice(PK_RADCE.rady(PODIL)).includes('Co říká cena'),
  'rádce si cenu domýšlí i bez modelu');

// --- 5) Otázky se řídí druhem i kategorií ----------------------------
pravda('u zemědělské půdy se ptá na pacht', /pacht/i.test(PK_RADCE.rady(orna).otazky.join(' ')));
pravda('u stavebního pozemku na přípojky', /přípojky/i.test(PK_RADCE.rady(stavebni).otazky.join(' ')));
pravda('u dražby na dražební jistotu', /jistota/i.test(PK_RADCE.rady(brzy).otazky.join(' ')));
pravda('vždycky právě tři otázky', [orna, les, stavebni, brzy, PODIL]
  .every((d) => PK_RADCE.rady(d, model).otazky.length === 3));
pravda('a na přístup z veřejné cesty se ptá u každého',
  [orna, les, stavebni, brzy].every((d) => /přístup z veřejné/i.test(PK_RADCE.rady(d).otazky.join(' '))));

// --- 6) Obě podoby říkají totéž --------------------------------------
// Tmavá varianta je pro panel na mapě, světlá pro stránku pozemku.
// Kdyby se počítaly zvlášť, můžou se rozejít — a přesně to se u cenového
// verdiktu stalo.
for (const d of [orna, les, stavebni, brzy, PODIL]) {
  const t = PK_RADCE.html(d, model).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const s = PK_RADCE.htmlSvetla(d, model).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Tmavá má navíc jen titulek rozbalovátka; zbytek textu musí sedět.
  if (!t.includes(s.slice(0, 400))) {
    pravda(`tmavá i světlá varianta říkají totéž (${d.place})`, false,
      `světlá: ${s.slice(0, 120)}…`);
    break;
  }
}
pravda('tmavá i světlá varianta říkají u všech pozemků totéž', chyb === 0 || zpravy[zpravy.length - 1].startsWith('  ✓'));

// --- 7) Rady nejsou nikde jinde v kódu -------------------------------
for (const f of ['../js/main.js', '../js/pozemek.js']) {
  const t = readFileSync(new URL(f, import.meta.url), 'utf8');
  pravda(`${f.replace('../', '')} nemá vlastní kopii rad`,
    !/function\s+(buildInfo|typeCaution)\s*\(/.test(t),
    'rady se zase kopírují — stačí změnit jednu a web si u téhož pozemku protiřečí');
}

console.log('\nRádce u pozemku — rady podle skutečných údajů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Rádce: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
