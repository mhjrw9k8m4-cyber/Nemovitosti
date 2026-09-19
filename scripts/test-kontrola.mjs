// Testy kontrol zadaných údajů (js/kontrola.js).
//
// Spuštění: node scripts/test-kontrola.mjs
// Běží i v CI při každém pushi — když někdo kontrolu rozbije, je to hned vidět.
//
// Každý případ je dvojice „co uživatel zadá" → „má to projít?". Přibyla-li
// nová past (někdo nahlásí, že mu prošlo něco nesmyslného), patří sem řádek.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = createRequire(import.meta.url)(path.join(ROOT, 'js', 'kontrola.js'));

let bezi = 0, spadlo = 0;
const vysledky = [];

function zkus(skupina, popis, hodnota, maProjit) {
  bezi++;
  const v = hodnota;
  const proslo = !!v.ok;
  if (proslo !== maProjit) {
    spadlo++;
    vysledky.push(`  ✕ ${skupina}: ${popis}\n      čekáno ${maProjit ? 'projde' : 'neprojde'}, vyšlo ${proslo ? 'projde' : 'neprojde'}` +
      (v.msg ? ` („${v.msg}")` : ''));
  }
}
const projde = (s, p, v) => zkus(s, p, v, true);
const neprojde = (s, p, v) => zkus(s, p, v, false);

/* ---------------- obec ---------------- */
projde('obec', 'běžný název', K.obec('Kolín'));
projde('obec', 'dvouslovný název', K.obec('Nové Město nad Metují'));
projde('obec', 'název s pomlčkou', K.obec('Frýdek-Místek'));
neprojde('obec', 'prázdná', K.obec(''));
neprojde('obec', 'jen mezery', K.obec('   '));
neprojde('obec', 'jedno písmeno', K.obec('K'));
neprojde('obec', 'jen číslo', K.obec('12345'));
neprojde('obec', 'odkaz místo obce', K.obec('www.spam.cz'));
neprojde('obec', 'sprostá slova', K.obec('kokot'));

/* ---------------- výměra ---------------- */
projde('výměra', 'běžná', K.vymera(1200));
projde('výměra', 'jako text s mezerou', K.vymera('12 000'));
projde('výměra', 'dolní mez', K.vymera(10));
projde('výměra', 'velký les', K.vymera(4000000));
neprojde('výměra', 'nula', K.vymera(0));
neprojde('výměra', 'záporná', K.vymera(-5));
neprojde('výměra', 'prázdná', K.vymera(''));
neprojde('výměra', 'text', K.vymera('velká'));
neprojde('výměra', 'pod mezí (5 m²)', K.vymera(5));
neprojde('výměra', 'nad mezí (celý okres)', K.vymera(99000000));

/* ---------------- cena ---------------- */
projde('cena', 'běžná', K.cena(450000));
projde('cena', 'dolní mez', K.cena(1000));
neprojde('cena', 'nula', K.cena(0));
neprojde('cena', 'stokoruna', K.cena(100));
neprojde('cena', 'miliarda', K.cena(1000000000));
neprojde('cena', 'text', K.cena('dohodou'));

/* ---------------- cena za metr (překlepy) ---------------- */
projde('Kč/m²', 'orná půda 40 Kč/m²', K.cenaZaMetr(48000, 1200));
projde('Kč/m²', 'stavební 3 000 Kč/m²', K.cenaZaMetr(3000000, 1000));
projde('Kč/m²', 'chybí výměra → nekontroluje se', K.cenaZaMetr(450000, 0));
neprojde('Kč/m²', 'přidaná nula v ceně (450 000 Kč za 2 m²)', K.cenaZaMetr(450000, 2));
neprojde('Kč/m²', 'hektar za tisícovku (0,1 Kč/m²)', K.cenaZaMetr(1000, 10000));
if (!K.cenaZaMetr(25000000, 1000).varovani) {
  spadlo++; vysledky.push('  ✕ Kč/m²: 25 000 Kč/m² má projít s varováním, ale žádné nepřišlo');
}
bezi++;

/* ---------------- popis ---------------- */
projde('popis', 'prázdný (je nepovinný)', K.popis(''));
projde('popis', 'normální věta', K.popis('Rovinatý pozemek na okraji obce, přístup z asfaltové cesty.'));
neprojde('popis', 'moc krátký', K.popis('hezký'));
neprojde('popis', 'HTML značky', K.popis('<script>alert(1)</script> pozemek u lesa v klidné části'));
neprojde('popis', 'samá velká písmena', K.popis('PRODÁM POZEMEK VELMI LEVNĚ RYCHLE VOLEJTE IHNED'));
neprojde('popis', 'odkaz v textu', K.popis('Více informací najdete na https://www.spam.cz/nabidka pozemku'));
neprojde('popis', 'e-mail v textu', K.popis('Pozemek u lesa, pište na prodej@example.com, ozvu se obratem'));
neprojde('popis', 'telefon v textu', K.popis('Krásný pozemek, volejte na 777 123 456, rád ukážu na místě'));
neprojde('popis', 'spam', K.popis('Investujte do bitcoin a vyhrál jste milion, klikni zde pro více'));
neprojde('popis', 'opakované znaky', K.popis('Pozemek aaaaaaaaaaaa u lesa v klidné části obce'));
neprojde('popis', 'sprostá slova', K.popis('Tenhle podělanej pozemek je kurva levnej, berte ho'));

/* ---------------- odkaz ---------------- */
projde('odkaz', 'prázdný (nepovinný)', K.odkaz(''));
projde('odkaz', 'bezrealitky', K.odkaz('https://www.bezrealitky.cz/nemovitosti/1022999-prodej-pozemku'));
projde('odkaz', 'katastr', K.odkaz('https://nahlizenidokn.cuzk.cz/Parcela/12345'));
projde('odkaz', 'bez https:// na začátku', K.odkaz('sreality.cz/detail/prodej/pozemek/123'));
neprojde('odkaz', 'javascript:', K.odkaz('javascript:alert(1)'));
neprojde('odkaz', 'data:', K.odkaz('data:text/html,<script>alert(1)</script>'));
neprojde('odkaz', 'jen slovo', K.odkaz('odkaz'));
neprojde('odkaz', 'localhost', K.odkaz('http://localhost:3000/pozemek'));
neprojde('odkaz', 'vnitřní síť', K.odkaz('http://192.168.1.1/admin'));
neprojde('odkaz', 'zkracovač', K.odkaz('https://bit.ly/3xYzAbc'));
neprojde('odkaz', 'odkaz zpět na Parcelku', K.odkaz('https://www.parcelaka.cz/pozemek.html?p=1'));
neprojde('odkaz', 'nekonečně dlouhý', K.odkaz('https://example.com/' + 'a'.repeat(400)));
neprojde('odkaz', 'přihlašovací údaje v adrese', K.odkaz('https://admin:heslo@banka.cz/prihlaseni'));
neprojde('odkaz', 'vlastní port', K.odkaz('https://example.com:8080/pozemek'));
neprojde('odkaz', 'soubor ke stažení (.apk)', K.odkaz('https://example.com/nabidka.apk'));
neprojde('odkaz', 'doména psaná cizími znaky (punycode)', K.odkaz('https://xn--bezreality-1ob.cz/pozemek'));
neprojde('odkaz', 'mezera uvnitř', K.odkaz('https://example.com/pozemek u lesa'));
neprojde('odkaz', 'číselná IP', K.odkaz('https://93.184.216.34/pozemek'));
neprojde('odkaz', 'dvě tečky v doméně', K.odkaz('https://example..com/pozemek'));
neprojde('odkaz', 'doména bez koncovky', K.odkaz('https://example./pozemek'));
{
  const r = K.odkaz('https://nejakyweb.cz/pozemek/123');
  bezi++;
  if (!r.ok || !r.varovani) { spadlo++; vysledky.push('  ✕ odkaz: neznámá doména má projít s upozorněním, vyšlo ' + JSON.stringify(r)); }
}
{
  const r = K.odkaz('https://nejakyweb.cz/');
  bezi++;
  if (!r.ok || !/úvodní/.test(r.varovani || '')) { spadlo++; vysledky.push('  ✕ odkaz: samotná úvodní stránka má projít s upozorněním, vyšlo ' + JSON.stringify(r)); }
}
{
  const cisty = K.ocistiOdkaz('https://sreality.cz/detail/1?utm_source=fb&fbclid=xyz&id=9');
  bezi++;
  if (/utm_|fbclid/.test(cisty) || !/id=9/.test(cisty)) { spadlo++; vysledky.push('  ✕ odkaz: úklid sledovacích přívěsků selhal → ' + cisty); }
}

/* ---------------- kontakt ---------------- */
projde('kontakt', 'telefon s mezerami', K.kontakt('777 123 654'));
projde('kontakt', 'telefon s předvolbou', K.kontakt('+420 606 123 987'));
projde('kontakt', 'e-mail', K.kontakt('jan.novak@seznam.cz'));
neprojde('kontakt', 'prázdný', K.kontakt(''));
neprojde('kontakt', 'krátké číslo', K.kontakt('12345'));
neprojde('kontakt', 'samé jedničky', K.kontakt('111111111'));
neprojde('kontakt', 'řada 123456789', K.kontakt('123456789'));
neprojde('kontakt', 'začíná nulou', K.kontakt('012345678'));
neprojde('kontakt', 'zjevně falešný e-mail', K.kontakt('test@test.cz'));
neprojde('kontakt', 'jen slovo', K.kontakt('zavolejte'));

/* ---------------- jméno ---------------- */
projde('jméno', 'jméno a příjmení', K.jmeno('Jan Novák'));
neprojde('jméno', 'prázdné', K.jmeno(''));
neprojde('jméno', 'dvě písmena', K.jmeno('Jo'));
neprojde('jméno', 's číslicí', K.jmeno('Jan Novák 1985'));
neprojde('jméno', 'e-mail místo jména', K.jmeno('jan@seznam.cz'));
if (!K.jmeno('Jan').varovani) {
  spadlo++; vysledky.push('  ✕ jméno: samotné křestní má projít s varováním, ale žádné nepřišlo');
}
bezi++;

/* ---------------- parcela ---------------- */
projde('parcela', 'prázdná (nepovinná)', K.parcela(''));
projde('parcela', 'číslo', K.parcela('123'));
projde('parcela', 'se zlomkem', K.parcela('123/4'));
projde('parcela', 'stavební', K.parcela('st. 45'));
neprojde('parcela', 'věta', K.parcela('nevím přesně, asi u lesa'));
neprojde('parcela', 'moc dlouhá', K.parcela('12345678901234567890123'));

/* ---------------- fotky ---------------- */
projde('fotka', 'běžná z mobilu', K.fotkaRozmery(4032, 3024));
projde('fotka', 'na šířku', K.fotkaRozmery(1920, 1080));
neprojde('fotka', 'ikonka', K.fotkaRozmery(64, 64));
neprojde('fotka', 'úzký proužek (snímek obrazovky)', K.fotkaRozmery(1290, 300));
neprojde('fotka', 'poškozená', K.fotkaRozmery(0, 0));
projde('fotka', 'normální jas a pestrost', K.fotkaObsah(120, 55));
neprojde('fotka', 'jednobarevná plocha', K.fotkaObsah(130, 4));
neprojde('fotka', 'fotka potmě', K.fotkaObsah(12, 30));
neprojde('fotka', 'přesvícená', K.fotkaObsah(250, 20));

/* ---------------- celý formulář ---------------- */
const dobry = {
  obec: 'Kolín', vymera: '1200', cena: '450000', parcela: '123/4',
  popis: 'Rovinatý pozemek na okraji obce, přístup z asfaltové cesty, elektřina na hranici.',
  odkaz: 'https://www.bezrealitky.cz/nemovitosti/123', jmeno: 'Jan Novák', kontakt: '777123654'
};
projde('formulář', 'správně vyplněný', K.formular(dobry));
neprojde('formulář', 'chybí obec', K.formular({ ...dobry, obec: '' }));
neprojde('formulář', 'překlep v ceně', K.formular({ ...dobry, cena: '450000', vymera: '2' }));
neprojde('formulář', 'odkaz v popisu', K.formular({ ...dobry, popis: 'Pozemek u lesa, vše na www.spam.cz najdete' }));

const chybaPole = K.formular({ ...dobry, kontakt: '111111111' });
bezi++;
if (chybaPole.id !== 'p-kontakt') {
  spadlo++; vysledky.push(`  ✕ formulář: chyba má ukázat na pole p-kontakt, ukázala na ${chybaPole.id}`);
}

/* ---------------- výsledek ---------------- */
console.log(`\nKontroly zadaných údajů: ${bezi} testů`);
if (spadlo) {
  console.log(vysledky.join('\n'));
  console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
