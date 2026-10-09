// Test: podklad pro kupní smlouvu — číslo slovy, označení pozemku, kontrola.
//
// Spuštění: node scripts/test-smlouva.mjs   (nepotřebuje prohlížeč ani síť)
//
// ČÁSTKA SLOVY SE OVĚŘUJE PROTI RUČNĚ NAPSANÉ TABULCE, ne proti druhému
// výpočtu. Kdybych očekávanou hodnotu dopočítal stejným pravidlem jako
// zkoušený kód, zkouška by ověřovala jen to, že jsem dvakrát napsal
// totéž — a chybu ve tvaroslovní, kterou tam mám, by zopakovala taky.
// Tabulka níž je proto vypsaná slovo po slovu.
//
// Dvě chyby takhle opravdu vypadly: „dvacet dvě korun českých" (ženská
// číslovka slepená s druhým pádem množného čísla) a „jeden milion tisíc
// korun českých" (zkrácení „jeden tisíc" na „tisíc" uprostřed čísla).
import { createRequire } from 'node:module';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const S = createRequire(import.meta.url)(path.join(ROOT, 'js', 'smlouva.js'));

let ok = 0, chyb = 0; const zpravy = [];
function je(popis, vyslo, cekano) {
  if (JSON.stringify(vyslo) === JSON.stringify(cekano)) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${JSON.stringify(cekano)}\n      vyšlo  ${JSON.stringify(vyslo)}`); }
}
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Čtení čísel ze vstupu ------------------------------------- */
je('číslo s mezerami', S.cislo('450 000'), 450000);
je('číslo s tečkami', S.cislo('450.000'), 450000);
je('číslo s nedělitelnou mezerou', S.cislo('450 000'), 450000);
je('číslo s koncovkou ,-', S.cislo('450000,-'), 450000);
je('číslo s desetinnou čárkou', S.cislo('1200,50'), 1200.5);
je('prázdno není číslo', S.cislo(''), null);
je('text není číslo', S.cislo('hodně'), null);
je('ani číslo s písmenem', S.cislo('450000 Kč'), null);
je('null není číslo', S.cislo(null), null);

/* --- 2) Částka slovy, proti ruční tabulce -------------------------- */
const TABULKA = [
  [0, 'nula korun českých'],
  [1, 'jedna koruna česká'],
  [2, 'dvě koruny české'],
  [3, 'tři koruny české'],
  [4, 'čtyři koruny české'],
  [5, 'pět korun českých'],
  [9, 'devět korun českých'],
  [10, 'deset korun českých'],
  [11, 'jedenáct korun českých'],
  [14, 'čtrnáct korun českých'],
  [15, 'patnáct korun českých'],
  [19, 'devatenáct korun českých'],
  [20, 'dvacet korun českých'],
  [21, 'dvacet jedna korun českých'],
  [22, 'dvacet dva korun českých'],
  [24, 'dvacet čtyři korun českých'],
  [25, 'dvacet pět korun českých'],
  [90, 'devadesát korun českých'],
  [99, 'devadesát devět korun českých'],
  [100, 'sto korun českých'],
  [101, 'sto jedna korun českých'],
  [102, 'sto dva korun českých'],
  [110, 'sto deset korun českých'],
  [121, 'sto dvacet jedna korun českých'],
  [200, 'dvě stě korun českých'],
  [300, 'tři sta korun českých'],
  [400, 'čtyři sta korun českých'],
  [500, 'pět set korun českých'],
  [900, 'devět set korun českých'],
  [999, 'devět set devadesát devět korun českých'],
  [1000, 'tisíc korun českých'],
  [1001, 'tisíc jedna koruna česká'],
  [1100, 'tisíc sto korun českých'],
  [2000, 'dva tisíce korun českých'],
  [2500, 'dva tisíce pět set korun českých'],
  [4000, 'čtyři tisíce korun českých'],
  [5000, 'pět tisíc korun českých'],
  [21000, 'dvacet jedna tisíc korun českých'],
  [100000, 'sto tisíc korun českých'],
  [450000, 'čtyři sta padesát tisíc korun českých'],
  [999000, 'devět set devadesát devět tisíc korun českých'],
  [1000000, 'jeden milion korun českých'],
  [1001000, 'jeden milion jeden tisíc korun českých'],
  [2000000, 'dva miliony korun českých'],
  [5000000, 'pět milionů korun českých'],
  [22000000, 'dvacet dva milionů korun českých'],
  [1000000000, 'jedna miliarda korun českých'],
  [2000000000, 'dvě miliardy korun českých'],
];
/* PŘEDPOKLAD. Kdyby tabulka zůstala prázdná, cyklus by neudělal nic
   a zkouška by svítila zeleně nad ničím. */
pravda(`tabulka má z čeho brát (${TABULKA.length} částek)`, TABULKA.length >= 40,
  'jen ' + TABULKA.length + ' řádků');
const spatne = TABULKA.filter(([n, t]) => S.slovy(n) !== t);
je('všechny částky z tabulky souhlasí', spatne.map(([n, t]) => `${n}: čekáno „${t}", vyšlo „${S.slovy(n)}"`), []);

je('záporná částka se slovy nepíše', S.slovy(-5), null);
je('ani částka s haléři', S.slovy(1200.5), null);
je('ani text', S.slovy('hodně'), null);
je('ani biliony — tolik za pozemek nikdo nedá', S.slovy(1000000000000), null);

/* Číslo a slovy musí platit o TÉŽE částce. Tohle není totéž co tabulka:
   zkouší se, že se obě cesty nerozejdou (třeba zaokrouhlením). */
je('450 000 číslem', S.castka('450 000'), '450 000 Kč');
je('1 234 567 číslem', S.castka(1234567), '1 234 567 Kč');
je('a tatáž částka slovy', S.slovy(1234567),
  'jeden milion dvě stě třicet čtyři tisíc pět set šedesát sedm korun českých');

/* --- 3) Označení pozemku ------------------------------------------- */
/* BEZ KATASTRÁLNÍHO ÚZEMÍ SE PODKLAD NESESTAVÍ. Parcelní číslo se v
   každém katastrálním území opakuje, takže „parc. č. 123" samo o sobě
   znamená kterýkoli z desítek pozemků po republice. */
je('bez katastrálního území nic', S.oznaceniPozemku({ parcela: '123/4' }), null);
je('bez parcelního čísla nic', S.oznaceniPozemku({ katastr: 'Bystřice' }), null);
je('z ničeho nic', S.oznaceniPozemku(null), null);
je('nejmenší úplné označení',
  S.oznaceniPozemku({ parcela: '123/4', katastr: 'Bystřice' }),
  'pozemek parc. č. 123/4, v katastrálním území Bystřice');
je('úplné označení',
  S.oznaceniPozemku({ parcela: '123/4', druh: 'orná půda', vymera: '1250',
    katastr: 'Bystřice', kodKatastru: '616453', obec: 'Bystřice', lv: '1234' }),
  'pozemek parc. č. 123/4, (orná půda), o výměře 1 250 m², '
  + 'v katastrálním území Bystřice (kód 616453), obec Bystřice, '
  + 'zapsaný na listu vlastnictví č. 1234');

/* --- 4) Kontrola vstupu ------------------------------------------- */
const PLNY = {
  prodavajici: [{ jmeno: 'Jan Novák', narozeni: '1. 1. 1970', adresa: 'Krátká 1, Bystřice' }],
  kupujici: [{ jmeno: 'Eva Dvořáková', narozeni: '2. 2. 1980', adresa: 'Dlouhá 2, Brno' }],
  pozemek: { parcela: '123/4', katastr: 'Bystřice', lv: '1234', vymera: '1250', druh: 'orná půda' },
  cena: { castka: '450 000', zpusob: 'uschova' },
};
function klice(d) { return S.zkontroluj(d).map((x) => x.pole).sort(); }
je('úplný vstup projde bez poznámek', klice(PLNY), []);
je('z ničeho se vytkne všechno podstatné', klice({}),
  ['cena', 'katastr', 'kupujici', 'lv', 'parcela', 'prodavajici'].sort());
je('chybějící datum narození se vytkne',
  klice(Object.assign({}, PLNY, { kupujici: [{ jmeno: 'Eva', adresa: 'Dlouhá 2' }] })), ['narozeni']);
je('nulová cena se vytkne',
  klice(Object.assign({}, PLNY, { cena: { castka: '0' } })), ['cena']);
je('záloha větší než cena se vytkne',
  klice(Object.assign({}, PLNY, { cena: { castka: '100 000', zaloha: '150 000' } })), ['zaloha']);
je('podíl zapsaný slovem se vytkne',
  klice(Object.assign({}, PLNY, { pozemek: Object.assign({}, PLNY.pozemek, { podil: 'polovina' }) })), ['podil']);
je('podíl zlomkem projde',
  klice(Object.assign({}, PLNY, { pozemek: Object.assign({}, PLNY.pozemek, { podil: '1/2' }) })), []);

/* --- 5) Text podkladu --------------------------------------------- */
/* NESESTAVÍ SE S PRÁZDNÝMI MÍSTY. Papír, který vypadá hotově a má
   v sobě dírу, je horší než žádný — podle něj se podepisuje. */
je('bez údajů se text nesestaví', S.smlouva({}), null);
je('bez katastrálního území taky ne',
  S.smlouva(Object.assign({}, PLNY, { pozemek: { parcela: '123/4' } })), null);

const t = S.smlouva(PLNY);
pravda('z úplného vstupu text vznikne', typeof t === 'string' && t.length > 600,
  'vyšlo ' + (t ? t.length + ' znaků' : t));
if (t) {
  pravda('říká hned, že to není hotová smlouva', /není hotová smlouva/.test(t));
  pravda('jsou v něm obě strany', t.includes('Jan Novák') && t.includes('Eva Dvořáková'));
  pravda('je v něm datum narození', t.includes('nar. 1. 1. 1970'));
  pravda('je v něm cena číslem i slovy',
    t.includes('450 000 Kč') && t.includes('čtyři sta padesát tisíc korun českých'));
  pravda('je v něm označení pozemku s katastrálním územím', t.includes('v katastrálním území Bystřice'));
  pravda('stojí v něm, že vlastníkem se člověk stává až vkladem', /vkladem\) do\n?/.test(t) || /zápisem \(vkladem\)/.test(t));
  pravda('a že podpisy pro katastr musí být ověřené', /úředně ověřené/.test(t));
  /* PAST: v textu nesmí zůstat zástupný znak. Kdyby se někdy do
     skládání dostal prázdný údaj, poznám to podle „undefined" nebo
     prázdných hranatých závorek — ne podle oka. */
  pravda('nikde v textu není undefined ani null', !/undefined|\bnull\b/.test(t),
    'v textu zůstal zástupný znak');
}

/* Bez úschovy musí text říct něco jiného — jinak by slíbil ochranu,
   kterou si strany nesjednaly. */
const tPrevod = S.smlouva(Object.assign({}, PLNY, { cena: { castka: '450 000', zpusob: 'prevod' } }));
pravda('u převodu na účet se o úschově nemluví',
  tPrevod && !/úschov/.test(tPrevod.split('IV.')[0]), 'úschova zůstala v článku o ceně');
pravda('u úschovy se o ní mluví', /úschov/.test(t.split('IV.')[0]));

/* Vady: když na pozemku něco je, nesmí tam stát prohlášení, že nic není. */
const tVady = S.smlouva(Object.assign({}, PLNY, { stav: { zastava: true, bremeno: true } }));
pravda('se zástavou se nevydává prohlášení, že nic není',
  tVady && !/nejsou zástavní/.test(tVady), 'prohlášení o bezvadnosti zůstalo i se zástavou');
pravda('a zástava i břemeno jsou vypsané',
  tVady && /zástavní právo/.test(tVady) && /věcné břemeno/.test(tVady));

/* Dva prodávající: musí být oba, a očíslovaní. */
const tDva = S.smlouva(Object.assign({}, PLNY, { prodavajici: [
  { jmeno: 'Jan Novák', narozeni: '1. 1. 1970', adresa: 'Krátká 1' },
  { jmeno: 'Marie Nováková', narozeni: '3. 3. 1972', adresa: 'Krátká 1' }] }));
pravda('dva prodávající jsou oba a očíslovaní',
  tDva && /1\) Jan Novák/.test(tDva) && /2\) Marie Nováková/.test(tDva));
pravda('a oba mají řádek na podpis',
  tDva && (tDva.match(/\.{20,}/g) || []).length >= 3,
  'řádků na podpis: ' + (tDva ? (tDva.match(/\.{20,}/g) || []).length : '—'));

/* --- 5b) Předání a náklady ---------------------------------------- */
/* Dvě věci, o které se nejčastěji vede spor. Kdo zaplatí poplatek za
   návrh na vklad, zákon nepředepisuje — je to ujednání stran, takže to
   ve smlouvě stát MUSÍ, jinak se na to přijde až na úřadě. */
function radek(d, vzor) { return (S.smlouva(d) || '').split('\n').filter((x) => vzor.test(x))[0] || ''; }
const PLATI = [['kupujici', 'kupující.'], ['prodavajici', 'prodávající.'],
               ['napul', 'strany společně, každá jednou polovinou.']];
for (const [k, konec] of PLATI) {
  const r = radek(Object.assign({}, PLNY, { vklad: { plati: k } }), /poplatek/);
  pravda(`poplatek za vklad: ${k} → „…${konec}"`, r.endsWith(konec), 'vyšlo „' + r + '"');
}
pravda('bez volby se poplatek nezamlčí, padne na kupujícího',
  /hradí kupující\.$/.test(radek(PLNY, /poplatek/)), 'vyšlo „' + radek(PLNY, /poplatek/) + '"');

/* Po předložce „do" je druhý pád: „do 1 dne", „do 14 dnů". Tabulka je
   ruční, ne dopočítaná týmž pravidlem. */
const DNY = [[1, 'do 1 dne'], [2, 'do 2 dnů'], [4, 'do 4 dnů'], [5, 'do 5 dnů'], [14, 'do 14 dnů'], [21, 'do 21 dnů']];
const spatneDny = DNY.filter(([n, t]) => !radek(Object.assign({}, PLNY, { vklad: { predaniDni: n } }), /předán/).includes(t));
je('tvar slova „den" po předložce „do" sedí', spatneDny.map(([n, t]) => n + ': čekáno „' + t + '"'), []);
for (const n of [0, -3, null, '', 'brzy']) {
  pravda(`nesmyslná lhůta (${JSON.stringify(n)}) se nevymýšlí, řekne se, že chybí`,
    /strany doplní/.test(radek(Object.assign({}, PLNY, { vklad: { predaniDni: n } }), /předán|doplní/)),
    'vyšlo „' + radek(Object.assign({}, PLNY, { vklad: { predaniDni: n } }), /předán|doplní/) + '"');
}
/* ČÁSTKA POPLATKU V PODKLADU NESTOJÍ. Web ji uvádí jen řádově a na
   jednom místě (rádce o nákladech). Opsat ji sem by znamenalo mít ji
   dvakrát a jednou špatně — a je to číslo, které se vyhláškou mění. */
pravda('výše poplatku se v podkladu netvrdí',
  !/\d[\d\s\u00a0]*Kč[^)]{0,30}(poplat|vklad)/i.test(S.smlouva(PLNY) || '')
  && !/poplat[^.]{0,60}\d[\d\s\u00a0]{2,}/i.test(S.smlouva(PLNY) || ''),
  'v textu se objevila konkrétní částka u poplatku');

/* Články musí jít po sobě. Přidáním nového se dvakrát posunula řada —
   a „VI. Závěrečná ustanovení" hned za „VI. Vklad" by si nikdo nevšiml
   dřív než na papíře u advokáta. */
{
  const rimske = (S.smlouva(PLNY) || '').split('\n')
    .map((x) => (/^([IVX]+)\. /.exec(x) || [])[1]).filter(Boolean);
  pravda(`články jsou očíslované (${rimske.join(', ')})`, rimske.length >= 6, 'našlo se jen ' + rimske.length);
  const CEKANO = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  je('a jdou po sobě bez díry a bez opakování', rimske, CEKANO.slice(0, rimske.length));
}

/* --- 6) Hodnoty do formuláře návrhu na vklad ---------------------- */
/* Vlastní listina „návrh na vklad" se NEVYRÁBÍ: podává se na formuláři
   ČÚZK a jiné podání úřad odmítne. Vypisují se tedy hodnoty do kolonek. */
const f = S.navrhNaVklad(PLNY);
pravda('formulář má co vypsat', Array.isArray(f) && f.length >= 8, 'vyšlo ' + (f ? f.length : f) + ' kolonek');
je('bez pozemku se nevypisuje nic', S.navrhNaVklad({ pozemek: {} }), null);
if (f) {
  const m = new Map(f.map((x) => [x.kolonka, x.hodnota]));
  pravda('je v něm katastrální území', (m.get('Katastrální území') || '').includes('Bystřice'));
  pravda('je v něm parcela', (m.get('Parcela') || '').includes('123/4'));
  pravda('je v něm výměra', (m.get('Parcela') || '').includes('1 250 m²'));
  pravda('převodce i nabyvatel',
    f.some((x) => /převodce/.test(x.kolonka) && x.hodnota.includes('Jan Novák'))
    && f.some((x) => /nabyvatel/.test(x.kolonka) && x.hodnota.includes('Eva Dvořáková')));
  pravda('a stojí tam, co se navrhuje zapsat',
    /vklad vlastnického práva/.test(m.get('Navrhovaný zápis') || ''));
  pravda('neznámý úřad se přiznává, nevymýšlí',
    /doplňte/.test(m.get('Katastrální úřad pro') || ''),
    'vyšlo „' + m.get('Katastrální úřad pro') + '"');
}

/* --- 7) Kontrolní seznam ------------------------------------------ */
const s1 = S.kontrolniSeznam(PLNY);
pravda('seznam má co říct', s1.length >= 8, 'jen ' + s1.length + ' bodů');
pravda('každý bod má napsané PROČ', s1.every((x) => x.proc && x.proc.length >= 30),
  'bez vysvětlení: ' + s1.filter((x) => !x.proc || x.proc.length < 30).map((x) => x.co).join(', '));
pravda('list vlastnictví je první', /[Ll]ist vlastnictví/.test(s1[0].co), 'první je „' + s1[0].co + '"');
const sPodil = S.kontrolniSeznam(Object.assign({}, PLNY,
  { pozemek: Object.assign({}, PLNY.pozemek, { podil: '1/2' }) }));
pravda('u podílu se přidá předkupní právo spoluvlastníků',
  sPodil.some((x) => /[Pp]ředkupní/.test(x.co)) && !s1.some((x) => /[Pp]ředkupní/.test(x.co)),
  'u celého pozemku by se tam objevit nemělo, u podílu má');
pravda('odkazy v seznamu míří na stránky, které tady jsou',
  s1.filter((x) => x.kde && x.kde.endsWith('.html'))
    .every((x) => ['pristupova-cesta-pozemek.html', 'kolik-stoji-koupe-pozemku.html'].includes(x.kde)),
  'odkazy: ' + s1.map((x) => x.kde).filter(Boolean).join(', '));

console.log('\nPodklad pro kupní smlouvu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Smlouva: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Smlouva: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
