// Testy psaní v aplikaci — logika schránky a konverzace
// (js/zpravy-logika.js) a odznak nepřečtených (js/zpravy-odznak.js).
//
// Spuštění: node scripts/test-zpravy.mjs
//
// Chat se špatně zkouší ručně: potřebuje dva účty, inzerát a trpělivost.
// Tyhle testy proto hlídají to, co se dá oddělit od prohlížeče — kdo je
// ten druhý, kdy se má seznam překreslit a co se řekne člověku, když to
// databáze odmítne.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const Z = req(path.join(ROOT, 'js', 'zpravy-logika.js'));
const O = req(path.join(ROOT, 'js', 'zpravy-odznak.js'));

let bezi = 0, spadlo = 0;
const vysledky = [];

function je(skupina, popis, vyslo, cekano) {
  bezi++;
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a !== b) { spadlo++; vysledky.push(`  ✕ ${skupina}: ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* ---------------- kdo je ten druhý ---------------- */
const UID = '7f3a91c2-0b4d-4e88-9a11-5c6d7e8f9a0b';
je('štítek', 'z uuid vezme poslední čtyři znaky', Z.stitekZajemce(UID), 'Zájemce 9A0B');
je('štítek', 'dva různí zájemci mají různý štítek',
  Z.stitekZajemce('aaaa') !== Z.stitekZajemce('bbbb'), true);
je('štítek', 'týž zájemce má vždy stejný štítek',
  Z.stitekZajemce(UID) === Z.stitekZajemce(UID), true);
je('štítek', 'prázdné id nespadne', Z.stitekZajemce(null), 'Zájemce');
je('štítek', 'štítek neprozradí celé id', Z.stitekZajemce(UID).includes('7f3a91c2'), false);

/* ---------------- hlavička konverzace ---------------- */
je('hlavička', 'z my_threads vezme obec i okres',
  Z.popisVlakna({ place: 'Kolín', okres: 'Kolín', is_owner: false }, {}).titulek, 'Kolín · okr. Kolín');
je('hlavička', 'zájemce vidí, že píše majiteli',
  Z.popisVlakna({ place: 'Kolín', is_owner: false }, {}).podtitul, 'Majitel pozemku');
je('hlavička', 'majitel vidí, kterému zájemci odpovídá',
  Z.popisVlakna({ place: 'Kolín', is_owner: true, buyer_id: UID }, {}).podtitul, 'Zájemce 9A0B');
// Nové vlákno ještě nemá zprávu, takže ho my_threads nezná — musí se
// použít to, co přišlo v adrese od tlačítka „Napsat majiteli".
je('hlavička', 'nové vlákno použije údaje z adresy',
  Z.popisVlakna(null, { place: 'Tábor', okres: 'Tábor' }).titulek, 'Tábor · okr. Tábor');
je('hlavička', 'bez obce nezůstane prázdná', Z.popisVlakna(null, {}).titulek, 'Pozemek');
je('hlavička', 'obec bez okresu se nezlomí',
  Z.popisVlakna({ place: 'Písek', okres: '' }, {}).titulek, 'Písek');
je('hlavička', 'údaj z databáze má přednost před adresou',
  Z.popisVlakna({ place: 'Kolín' }, { place: 'Podvrh' }).titulek, 'Kolín');

/* ---------------- kdy překreslit ---------------- */
const m = (id, mine) => ({ id, created_at: '2026-09-19T10:0' + id + ':00Z', mine, body: 'x' });
je('překreslení', 'prázdné vlákno má stálý otisk', Z.otiskZprav([]), Z.otiskZprav([]));
je('překreslení', 'stejné zprávy = stejný otisk',
  Z.otiskZprav([m(1, true), m(2, false)]) === Z.otiskZprav([m(1, true), m(2, false)]), true);
je('překreslení', 'nová zpráva otisk změní',
  Z.otiskZprav([m(1, true)]) === Z.otiskZprav([m(1, true), m(2, false)]), false);

/* ---------------- kdy sjet dolů ---------------- */
// Sjíždět dolů při každém dotazu bylo to, čemu uživatel říkal „web klouže":
// čtete si starší zprávu a obsah vám pod prstem uteče zpátky dolů.
je('posun', 'nic nepřibylo → nesjíždět',
  Z.prisloNoveOdDruheho([m(1, true)], [m(1, true)]), false);
je('posun', 'přibyla moje vlastní zpráva → nesjíždět kvůli ní',
  Z.prisloNoveOdDruheho([m(1, true)], [m(1, true), m(2, true)]), false);
je('posun', 'přibyla zpráva od druhého → sjet dolů',
  Z.prisloNoveOdDruheho([m(1, true)], [m(1, true), m(2, false)]), true);
je('posun', 'přibyly obě, jedna od druhého → sjet dolů',
  Z.prisloNoveOdDruheho([m(1, true)], [m(1, true), m(2, true), m(3, false)]), true);
je('posun', 'seznam se zkrátil → nesjíždět',
  Z.prisloNoveOdDruheho([m(1, true), m(2, false)], [m(1, true)]), false);

/* ---------------- hlášky pro člověka ---------------- */
je('hláška', 'rychlé psaní za sebou', Z.hlaskaChyby({ message: 'chvíli počkejte' }),
  'Moment — mezi zprávami nechte pár vteřin.');
je('hláška', 'hodinový strop', Z.hlaskaChyby({ message: 'příliš mnoho zpráv, zkuste to za chvíli' }),
  'Za poslední hodinu je to hodně zpráv. Zkuste to prosím za chvíli.');
je('hláška', 'vypršené přihlášení', Z.hlaskaChyby({ message: 'musíte být přihlášeni' }),
  'Přihlášení vypršelo. Přihlaste se prosím znovu.');
je('hláška', 'smazaný inzerát', Z.hlaskaChyby({ message: 'inzerát neexistuje' }),
  'Tenhle inzerát už na Parcelce není.');
je('hláška', 'cizí konverzace', Z.hlaskaChyby({ message: 'nemáte přístup k této konverzaci' }),
  'K téhle konverzaci nemáte přístup.');
je('hláška', 'délka zprávy zmíní konkrétní mez',
  Z.hlaskaChyby({ message: 'zpráva je příliš dlouhá' }).includes(String(Z.MAX_ZPRAVA)), true);
je('hláška', 'neznámou chybu nepřeloží mlčky', Z.hlaskaChyby({ message: 'kdovíco' }),
  'Zprávu se nepovedlo odeslat. Zkuste to prosím znovu.');
je('hláška', 'nic nepředaného nespadne', typeof Z.hlaskaChyby(null), 'string');
je('hláška', 'hlášku umí přečíst i z hint',
  Z.hlaskaChyby({ hint: 'chvíli počkejte' }), 'Moment — mezi zprávami nechte pár vteřin.');

/* ---------------- počítadlo znaků ---------------- */
je('délka', 'krátká zpráva počítadlo neukazuje', Z.stavDelky('ahoj').ukazat, false);
je('délka', 'blízko meze se ukáže', Z.stavDelky('a'.repeat(1850)).ukazat, true);
je('délka', 'přes mez se pozná', Z.stavDelky('a'.repeat(2001)).prilis, true);
je('délka', 'přesně na mezi ještě projde', Z.stavDelky('a'.repeat(Z.MAX_ZPRAVA)).prilis, false);
je('délka', 'prázdné pole nespadne', Z.stavDelky('').delka, 0);
// Mez musí sedět s tím, co hlídá send_message v SQL — jinak se člověk dozví
// o překročení až od serveru, po odeslání.
je('délka', 'mez je stejná jako v databázi', Z.MAX_ZPRAVA, 2000);

/* ---------------- odznak nepřečtených ---------------- */
je('odznak', 'nula se neukazuje', O.textOdznaku(0), '');
je('odznak', 'záporné číslo se neukazuje', O.textOdznaku(-3), '');
je('odznak', 'malé číslo rovnou', O.textOdznaku(4), '4');
je('odznak', 'devět ještě celé', O.textOdznaku(9), '9');
je('odznak', 'nad devět zkráceně', O.textOdznaku(10), '9+');
je('odznak', 'titulek dostane počet', O.titulekSPoctem('Parcelka', 3), '(3) Parcelka');
je('odznak', 'počet v titulku se nehromadí',
  O.titulekSPoctem(O.titulekSPoctem('Parcelka', 3), 5), '(5) Parcelka');
je('odznak', 'po přečtení z titulku zmizí',
  O.titulekSPoctem(O.titulekSPoctem('Parcelka', 3), 0), 'Parcelka');
je('odznak', 'i zkrácený počet se z titulku uklidí',
  O.titulekSPoctem(O.titulekSPoctem('Parcelka', 40), 0), 'Parcelka');

/* ---------------- výsledek ---------------- */
console.log(`\nPsaní v aplikaci: ${bezi} testů`);
if (spadlo) {
  console.log(vysledky.join('\n'));
  console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
