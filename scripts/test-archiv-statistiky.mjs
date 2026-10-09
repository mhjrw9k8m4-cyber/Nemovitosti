/* Test: statistika z krátkého okna umí lhát — tohle jí to zakazuje.
   ==================================================================
   Spuštění: node scripts/test-archiv-statistiky.mjs   (bez prohlížeče)

   PROČ TENHLE TEST EXISTUJE. V roadmapě stálo „doba na trhu (medián
   7 dnů u zmizelých)". Spočítané správně, a přesto nepravda: archiv
   pozoruje trh 24 dní, zmizelým vyšel medián 7 dnů — ale 1 949 nabídek
   na trhu pořád je a 95 % z nich déle než týden. Medián „u zmizelých"
   popisuje jen tu rychlou menšinu a o většině mlčí.

   Takovou chybu nepozná ani rozbitý build, ani rozbitá stránka. Pozná
   ji jen zkouška, která si nachystá trh, u kterého PŘEDEM ví, co je
   pravda, a trvá na tom, že to tak vyjde. Proto se tady nepočítá
   s opravdovým archivem (ten se mění každý den), ale s vymyšleným:
   každý případ má jednu vlastnost a jedno číslo, které musí vyjít.

   CO SE TU HLÍDÁ:
     A) do kohorty „do N dní" smí jen nabídka, která MĚLA ŠANCI být
        sledovaná celých N dní — mladší se nepočítá ani jako přežívající
     B) medián se nevydá, dokud je víc než polovina nabídek živá
     C) kohorta menší než MIN_KOHORTA se nevypíše vůbec
     D) co tu bylo před začátkem pozorování, se nepočítá
     E) zlevnění (`proc: 'cena'`) není zmizení
     F) na opravdovém archivu musí medián být pořád NELZE
     H) nová cena se bere z NÁSLEDUJÍCÍHO období, ne z téhož řádku
     G) roadmapa už to zavádějící číslo neuvádí
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statistiky, zmenyCen, dny, nactiArchiv, MIN_KOHORTA, MIN_ZMEN } from './archiv-statistiky.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}
/* Kohortu hledáme podle počtu dní. Když tam není, je to NÁLEZ, ne pád
   výjimkou — spadlá zkouška je horší než červená, protože z ní není
   vidět, co se pokazilo. */
const koh = (s, n) => s.krivka.find((k) => k.dni === n) || { chybi: true };
/* A totéž pro změny ceny. Při sabotáži „zdražení se počítá jako sleva"
   zmizel z pole zdrazeni nulový prvek a test spadl výjimkou „Cannot
   read properties of undefined" — CI by bylo červené, ale bez jediné
   hlášky, podle které by se poznalo proč. */
const pol = (pole, i) => (pole && pole[i]) || { chybi: true };

/* Vymyšlený trh. `zavrene` jsou období, která skončila, `zive` nabídky,
   které na trhu pořád jsou. Klíče se jen číslují, na jejich podobě
   tady nic nezávisí. */
let poradi = 0;
const zmizele = (pocet, od, do_) => Array.from({ length: pocet }, () =>
  ({ k: 'z' + (++poradi), od, do: do_, proc: 'zmizela' }));
const zive = (pocet, od) => {
  const n = {};
  for (let i = 0; i < pocet; i++) n['l' + (++poradi)] = { od, videno: od };
  return n;
};
const trh = (zavrene, nabidky) => ({ uzavrene: zavrene, stav: { nabidky } });

/* ---- 0) dny() ---- */
je('dny() počítá rozdíl dnů', dny('2026-01-01', '2026-01-11'), 10);
je('a nepleče se o přechodu na letní čas', dny('2026-03-28', '2026-03-30'), 2);
je('stejný den je nula', dny('2026-05-05', '2026-05-05'), 0);

/* ---- A) mladá nabídka se do kohorty nepočítá vůbec ----
   Trh: 120 nabídek z 1. 3. zmizelo za dva dny, a 500 nabídek se
   objevilo včera. Těch 500 nemohlo být sledovaných tři dny, takže
   do kohorty „do 3 dní" nepatří — ani jako přežívající. Kdyby se
   počítaly, vyšlo by 19 % místo 100 %. */
{
  const t = trh(
    zmizele(120, '2026-03-01', '2026-03-03'),
    Object.assign(zive(1, '2026-01-01'), zive(500, '2026-03-31')),
  );
  const s = statistiky(t.uzavrene, t.stav, '2026-04-01');
  je('A: do kohorty „do 3 dní" se vejdou jen ty, co měly šanci', koh(s, 3).zKolika, 120);
  je('A: a všech 120 je pryč', koh(s, 3).pryc, 120);
  je('A: podíl je tedy 100 %, ne 19 %', koh(s, 3).podil, 100);
  je('A: kohorta „do 60 dní" neexistuje, na tu okno nestačí', koh(s, 60).chybi, true);
  je('A: a sledovaných je 620 (120 zmizelých + 500 živých, bez prvního)',
    s.sledovano.pozorovanych, 620);
}

/* ---- B) medián se nevydá, dokud je většina nabídek živá ---- */
{
  const malo = trh(
    zmizele(120, '2026-03-01', '2026-03-03'),
    Object.assign(zive(1, '2026-01-01'), zive(500, '2026-03-31')),
  );
  const s1 = statistiky(malo.uzavrene, malo.stav, '2026-04-01');
  je('B: medián se nevydá, když skončila jen pětina', s1.median, null);
  je('B: a místo čísla je vysvětlení s počty',
    /120 z 620/.test(s1.medianProc || ''), true);

  /* Teď trh, kde většina už skončila: 300 nabídek viselo 10 dní,
     50 visí dál. Medián existuje a musí vyjít přesně 10. */
  const dost = trh(
    zmizele(300, '2026-02-01', '2026-02-11'),
    Object.assign(zive(1, '2026-01-01'), zive(50, '2026-02-01')),
  );
  const s2 = statistiky(dost.uzavrene, dost.stav, '2026-04-01');
  je('B: když většina skončila, medián se vydá', s2.median, 10);
  je('B: a vysvětlení už není potřeba', s2.medianProc, null);
}

/* ---- C) hranice MIN_KOHORTA ----
   Kohorta o 99 nabídkách se nevypíše, o 100 ano. Zkouší se obě strany
   hranice, protože jen tak je vidět, že se opravdu kontroluje. */
{
  je('C: hranice je ' + MIN_KOHORTA, MIN_KOHORTA, 100);
  const pod = trh(zmizele(MIN_KOHORTA - 1, '2026-02-01', '2026-02-02'), zive(1, '2026-01-01'));
  const sPod = statistiky(pod.uzavrene, pod.stav, '2026-04-01');
  je('C: pod hranicí se nevypíše žádná kohorta', sPod.krivka.length, 0);
  je('C: ani medián', sPod.median, null);

  const na = trh(zmizele(MIN_KOHORTA, '2026-02-01', '2026-02-02'), zive(1, '2026-01-01'));
  const sNa = statistiky(na.uzavrene, na.stav, '2026-04-01');
  je('C: přesně na hranici už ano', koh(sNa, 3).zKolika, MIN_KOHORTA);
  je('C: a medián taky (všechny skončily)', sNa.median, 1);
}

/* ---- D) co tu bylo před začátkem pozorování, se nepočítá ----
   200 nabídek má `od` přesně na začátku okna — to datum je převzaté
   ze zdroje, ne viděné, a hlavně nevíme, co všechno zmizelo, než jsme
   se začali dívat. Kdyby se počítaly, vyšlo by „do 3 dní pryč 67 %"
   místo pravdivých 0 %. */
{
  const t = trh(
    [...zmizele(200, '2026-01-01', '2026-01-02'), ...zmizele(100, '2026-02-01', '2026-02-20')],
    zive(1, '2026-01-01'),
  );
  const s = statistiky(t.uzavrene, t.stav, '2026-04-01');
  je('D: sleduje se jen těch 100 s viděným začátkem', s.sledovano.pozorovanych, 100);
  je('D: do 3 dní pryč 0 %, ne 67 %', koh(s, 3).podil, 0);
  je('D: do 21 dní pryč 100 %', koh(s, 21).podil, 100);
  je('D: okno začíná prvním dnem, který archiv zná', s.okno.od, '2026-01-01');
  je('D: a trvá 90 dní', s.okno.dni, 90);
}

/* ---- E) zlevnění není zmizení ----
   Když nabídka zlevní, archiv uzavře období se starou cenou a nabídka
   běží dál. Takový řádek nesmí vypadat jako zmizelá nabídka. */
{
  /* 150× tentýž příběh: nabídka visela od 1. 2., 3. 2. zlevnila
     z milionu na 900 tisíc a od 4. 2. visí dál. Uzavřené období
     i živá nabídka musí mít TENTÝŽ klíč, jinak to není jedna
     nabídka, ale dvě — a přesně na tom se pozná, že se nová cena
     opravdu páruje se starou. */
  const zavrene = [], nabidky = zive(1, '2026-01-01');
  for (let i = 0; i < 150; i++) {
    const k = 'p' + i;
    zavrene.push({ k, o: 'Kolín', dr: 'orná půda', c: 1000000, od: '2026-02-01', do: '2026-02-03', proc: 'cena' });
    nabidky[k] = { od: '2026-02-04', videno: '2026-04-01', c: 900000 };
  }
  const s = statistiky(zavrene, { nabidky }, '2026-04-01');
  je('E: zlevnělé nabídky se počítají jako živé', s.sledovano.pozorovanych, 150);
  je('E: a jako zmizelé ne', koh(s, 3).pryc, 0);
  je('E: medián doby na trhu se z nich nevydá, žádná neskončila', s.median, null);
  je('E: zlevnění se spočítá zvlášť', [s.zlevneni.pocet, s.zlevneni.nabidek], [150, 150]);
  je('E: a ví, o kolik procent', s.zlevneni.medianSleva, 10);
}

/* ---- F) na opravdovém archivu musí medián být pořád NELZE ----
   Tohle je ta kontrola, kvůli které to celé vzniklo. Až okno povyroste
   a většina pozorovaných nabídek skončí, medián se objeví a tenhle
   řádek se musí přepsat — do té doby je každé číslo lež. */
{
  const { uzavrene, stav } = nactiArchiv();
  const dnes = stav.den || new Date().toISOString().slice(0, 10);
  const s = statistiky(uzavrene, stav, dnes);
  je('F: opravdový archiv má co počítat', s.sledovano.pozorovanych > 100, true);
  je('F: a většina nabídek je pořád živá', s.sledovano.zivych > s.sledovano.pozorovanych / 2, true);
  je('F: takže medián je NELZE', s.median, null);
  const spatne = s.krivka.filter((k) => k.pryc > k.zKolika || k.podil < 0 || k.podil > 100
    || k.zKolika < MIN_KOHORTA);
  je('F: každá vypsaná kohorta drží tvar', spatne, []);
  je('F: a je jich aspoň dvě', s.krivka.length >= 2, true);
}

/* ---- H) změny ceny ----
   Archiv při zlevnění uzavře období se STAROU cenou a nabídka běží dál
   s novou. Novou cenu tedy drží NÁSLEDUJÍCÍ řádek, a u poslední změny
   živý stav. Kdo to spojí špatně, spočítá procenta ze dvou různých
   pozemků — a nikdo si toho nevšimne, protože výsledek vypadá jako
   procento. */
{
  const A = 'Kolín|1/1|Kolín|50.0|15.2';
  const B = 'Brno|2/2|Brno|49.2|16.6';
  const uzavrene = [
    /* A: 1 000 000 → 900 000 (10 %) → 810 000 (10 %), pak visí dál */
    { k: A, o: 'Kolín', dr: 'orná půda', c: 1000000, od: '2026-02-01', do: '2026-02-11', proc: 'cena' },
    { k: A, o: 'Kolín', dr: 'orná půda', c: 900000, od: '2026-02-12', do: '2026-02-22', proc: 'cena' },
    /* B: 500 000 → 600 000 (zdražení), pak zmizela */
    { k: B, o: 'Brno', dr: 'zahrada', c: 500000, od: '2026-03-01', do: '2026-03-05', proc: 'cena' },
    { k: B, o: 'Brno', dr: 'zahrada', c: 600000, od: '2026-03-06', do: '2026-03-20', proc: 'zmizela' },
  ];
  const stav = { nabidky: { [A]: { od: '2026-02-23', c: 810000 } } };
  const z = zmenyCen(uzavrene, stav);
  je('H: dvě zlevnění a jedno zdražení', [z.zlevneni.length, z.zdrazeni.length], [2, 1]);
  je('H: první zlevnění je z 1 000 000 na 900 000',
    [pol(z.zlevneni, 0).stara, pol(z.zlevneni, 0).nova, pol(z.zlevneni, 0).procent], [1000000, 900000, 10]);
  je('H: poslední zlevnění vezme novou cenu z živého stavu',
    [pol(z.zlevneni, 1).stara, pol(z.zlevneni, 1).nova, pol(z.zlevneni, 1).procent], [900000, 810000, 10]);
  je('H: a ví, po kolika dnech k němu došlo', pol(z.zlevneni, 0).dni, 10);
  je('H: zdražení se nepočítá jako sleva', [pol(z.zdrazeni, 0).stara, pol(z.zdrazeni, 0).nova], [500000, 600000]);
  je('H: cizí pozemek se do výpočtu nezamíchá',
    z.zlevneni.every((x) => x.k === A), true);

  /* Řádek s poslední cenou, ke kterému není následník ani živý stav,
     se musí mlčky zahodit — jinak by se proti němu počítalo nic. */
  const osirely = zmenyCen([{ k: B, c: 500000, od: '2026-03-01', do: '2026-03-05', proc: 'cena' }], { nabidky: {} });
  je('H: změna bez známé nové ceny se zahodí', osirely.zlevneni.length + osirely.zdrazeni.length, 0);

  /* Medián slevy se nevypíše, dokud případů není dost: jedna špatně
     načtená cena (viděli jsme slevu 93 %) přetočí medián z deseti. */
  const malo = statistiky(uzavrene, stav, '2026-04-01');
  je('H: hranice pro medián slevy je ' + MIN_ZMEN, MIN_ZMEN, 30);
  je('H: ze dvou zlevnění se medián slevy nevydá', malo.zlevneni.medianSleva, null);
  je('H: ale počet se vypíše vždy', [malo.zlevneni.pocet, malo.zlevneni.zdrazeni], [2, 1]);

  /* A nad hranicí už ano. 30 nabídek, každá zlevnila o 20 % po 5 dnech. */
  const hodne = [], hodneStav = { nabidky: {} };
  for (let i = 0; i < MIN_ZMEN; i++) {
    const k = 'X' + i;
    hodne.push({ k, o: 'Kolín', c: 1000000, od: '2026-02-01', do: '2026-02-06', proc: 'cena' });
    hodneStav.nabidky[k] = { od: '2026-02-07', c: 800000 };
  }
  const sHodne = statistiky(hodne, hodneStav, '2026-04-01');
  je('H: přesně na hranici se medián slevy vydá', sHodne.zlevneni.medianSleva, 20);
  je('H: i medián dnů do zlevnění', sHodne.zlevneni.medianDni, 5);
  je('H: a okresy jsou seřazené podle počtu', sHodne.zlevneni.okresy, [['Kolín', MIN_ZMEN]]);
}

/* ---- G) roadmapa už to zavádějící číslo neuvádí ---- */
{
  const r = fs.readFileSync(path.join(ROOT, 'docs', 'roadmap.md'), 'utf8');
  je('G: roadmapa necituje „medián 7 dnů"', /medi[áa]n 7 dn/.test(r), false);
  je('G: a říká, proč medián nejde', /[Mm]edi[áa]n[\s ]+doby[\s ]+na[\s ]+trhu[\s ]+se[\s ]+spo[čc][íi]tat[\s ]+NED[ÁA]/.test(r), true);
  je('G: a nabízí místo něj podíl po N dnech', /po[\s ]+N[\s ]+dnech[\s ]+pry[čc]/.test(r), true);
}

console.log('\nStatistika z archivu: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Statistika z archivu: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log('\nVšechny prošly.\n');
