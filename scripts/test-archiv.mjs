/* Test: archiv nabídek si pamatuje, co se nabízelo a jak dlouho.
   ==================================================================
   Spuštění: node scripts/test-archiv.mjs   (nepotřebuje prohlížeč)

   Archiv je jediné místo, kde zůstane, že pozemek byl za tolik
   nabízený od–do. Web sám zná jen dnešek: data/opportunities.json se
   při každém běhu robota přepíše a po zmizelé nabídce zbude náhrobek,
   který se po 90 dnech smaže. Když se archiv pokazí, nikdo si toho
   nevšimne — chybí přece něco, co ještě neexistuje. Proto se zkouší
   na čisté funkci krok() celý život nabídky: vznik, zlevnění, zmizení.
   ================================================================== */
import fsx from 'node:fs';
import pathx from 'node:path';
import { createRequire as createRequireX } from 'node:module';
import { fileURLToPath as furlX } from 'node:url';
import { krok } from './archiv.mjs';

const KOREN_X = pathx.resolve(pathx.dirname(furlX(import.meta.url)), '..');
const reqX = createRequireX(import.meta.url);
const KLICX = reqX(pathx.join(KOREN_X, 'js', 'klic.js')).PKKlic;
const PKHX = reqX(pathx.join(KOREN_X, 'js', 'hlidani-logika.js'));
const PKCX = reqX(pathx.join(KOREN_X, 'js', 'cisteni.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}
/* SPADLÁ ZKOUŠKA JE HORŠÍ NEŽ ČERVENÁ. Při sabotáži (do klíče se vrátila
   cena, takže zlevnění vypadá jako nový pozemek) zmizel z nového stavu
   sledovaný klíč a test spadl výjimkou „Cannot read properties of
   undefined" — CI bylo červené, ale bez jediné hlášky, podle které by
   se poznalo proč. Ke sledované nabídce se proto chodí přes tohle:
   když tam není, je to NÁLEZ, ne pád. */
const kde = (stav, k) => (stav && stav.nabidky && stav.nabidky[k]) || { chybi: true };

const P = (zm) => Object.assign({ place: 'Kolín', okres: 'Kolín', lat: 50.0, lng: 15.2,
  parcel: '123/4', druh: 'orná půda', type: 'sale', area: 1000, price: 500000 }, zm || {});
const PRAZDNY = { verze: 1, den: '', nabidky: {} };

/* ---- 1) vznik ---- */
let v = krok(PRAZDNY, [P()], '2026-01-10');
je('nová nabídka se začne sledovat', Object.keys(v.stav.nabidky).length, 1);
je('a nic se hned neuzavírá', v.uzavrene.length, 0);
const klic = Object.keys(v.stav.nabidky)[0];
je('klíč neobsahuje cenu (jinak by sleva vypadala jako nový pozemek)',
  klic.indexOf('500000') < 0, true);
je('za začátek se bere first_seen ze zdroje, ne dnešek',
  kde(krok(PRAZDNY, [P({ first_seen: '2025-12-01' })], '2026-01-10').stav, klic).od, '2025-12-01');
je('ale datum z budoucnosti se zahodí',
  kde(krok(PRAZDNY, [P({ first_seen: '2030-01-01' })], '2026-01-10').stav, klic).od, '2026-01-10');

/* ---- 2) visí dál ---- */
const v2 = krok(v.stav, [P()], '2026-01-20');
je('když visí dál, nic se neuzavírá', v2.uzavrene.length, 0);
je('a začátek se nemění', kde(v2.stav, klic).od, '2026-01-10');
je('posune se jen „naposled viděno"', kde(v2.stav, klic).videno, '2026-01-20');

/* ---- 3) zlevnění ---- */
const v3 = krok(v2.stav, [P({ price: 450000 })], '2026-01-25');
je('zlevnění uzavře období', v3.uzavrene.length, 1);
je('a uzavře ho se STAROU cenou', v3.uzavrene[0].c, 500000);
je('s důvodem „cena"', v3.uzavrene[0].proc, 'cena');
je('období sedí na dny, kdy ta cena platila', [v3.uzavrene[0].od, v3.uzavrene[0].do],
  ['2026-01-10', '2026-01-20']);
je('a nabídka běží dál s novou cenou', kde(v3.stav, klic).c, 450000);
je('nové období začíná dnem zlevnění', kde(v3.stav, klic).od, '2026-01-25');

/* ---- 4) zmizení ---- */
const v4 = krok(v3.stav, [], '2026-02-03');
je('zmizelá nabídka se uzavře', v4.uzavrene.length, 1);
je('s důvodem „zmizela"', v4.uzavrene[0].proc, 'zmizela');
je('a se dnem, kdy byla naposled vidět (ne dneškem)', v4.uzavrene[0].do, '2026-01-25');
je('a přestane se sledovat', Object.keys(v4.stav.nabidky).length, 0);
/* DOBA NA TRHU je to, kvůli čemu archiv vzniká. U zlevněné nabídky se
   nesmí počítat od zlevnění — to by každá sleva vypadala jako nový
   pozemek a doba na trhu by vyšla kratší, než byla. */
je('z uzavřených období se dá poskládat celá doba na trhu',
  [v3.uzavrene[0].od, v4.uzavrene[0].do], ['2026-01-10', '2026-01-25']);

/* ---- 5) co archiv dělat NESMÍ ---- */
const jiny = P({ parcel: '999/9' });
const v5 = krok(v2.stav, [P(), jiny], '2026-01-26');
je('dva různé pozemky se nesloučí', Object.keys(v5.stav.nabidky).length, 2);
const v6 = krok(PRAZDNY, [P(), P()], '2026-01-10');
/* Popisek měl dřív v závorce „duplicity řeší web jinde". Neplatí to:
   krok() je teď odstraňuje sám, a to TOUŽ cestou jako aplikace
   (PKCisteni.pozemky → PKHlidani.bezDuplicit). Dokud to nedělal,
   zastával tu práci hrubý pkey — a slepoval i pozemky, které duplicity
   nejsou. */
je('ale tentýž pozemek dvakrát se sloučí v jednu nabídku',
  Object.keys(v6.stav.nabidky).length, 1);
je('nabídka bez obce nebo okresu se nesleduje (nejde ji poznat)',
  Object.keys(krok(PRAZDNY, [P({ place: '' }), P({ okres: '' })], '2026-01-10').stav.nabidky).length, 0);

/* ---- 6) skutečný archiv v repozitáři ---- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADR = path.join(KOREN, 'data', 'archiv');
if (fs.existsSync(ADR)) {
  const soubory = fs.readdirSync(ADR).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f));
  let radku = 0, spatne = [];
  for (const f of soubory) {
    for (const l of fs.readFileSync(path.join(ADR, f), 'utf8').trim().split('\n')) {
      if (!l) continue;
      radku++;
      let r; try { r = JSON.parse(l); } catch (e) { spatne.push(f + ': neplatný JSON'); continue; }
      if (!r.k || !r.od || !r.do || !r.proc) spatne.push(f + ': chybí pole v ' + l.slice(0, 60));
      else if (r.do < r.od) spatne.push(f + ': konec před začátkem ' + r.od + '→' + r.do);
      else if (f.slice(0, 7) !== r.do.slice(0, 7)) spatne.push(f + ': řádek patří do jiného měsíce (' + r.do + ')');
    }
  }
  je(`archiv v repozitáři má řádky (${radku})`, radku > 0, true);
  je('a všechny jsou v pořádku', spatne.slice(0, 3), []);
} else {
  je('archiv v repozitáři existuje', false, true);
}

/* ---- KLÍČ ARCHIVU ----
   Dřív si archiv klíčoval nabídky přes pkey. Ten je ZÁMĚRNĚ hrubý
   (souřadnice na tři desetinná místa, parcelní číslo u většiny chybí),
   aby přežil zpřesnění geokódování — uložené pozemky a poznámky na tom
   stojí. V archivu ale slepil dva různé pozemky do jedné nabídky:
   38 klíčů sedělo na 94 nabídek a u 25 z nich se lišila cena. Archiv
   pak podle pořadí v souboru zapisoval „zlevnila o 41 %" a zdražila
   zpátky — osm ze 138 změn ceny se nikdy nestalo.
   Tyhle kontroly hlídají, aby se to nevrátilo. */
{
  const A = { place: 'Lázně Bohdaneč', parcel: '—', okres: 'Pardubice', lat: 50.0994, lng: 15.6771,
    area: 824, price: 23100, url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/1070318-nabidka' };
  const B = { place: 'Lázně Bohdaneč', parcel: '—', okres: 'Pardubice', lat: 50.0994, lng: 15.6771,
    area: 1391, price: 39000, url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/968539-nabidka' };
  je('pkey na těch dvou pozemcích opravdu kolidoval', KLICX.pkey(A) === KLICX.pkey(B), true);
  je('klíč archivu je rozliší', KLICX.klicArchivu(A) !== KLICX.klicArchivu(B), true);
  je('a cena v něm NENÍ (jinak by každá sleva byla nový pozemek)',
    KLICX.klicArchivu(A) === KLICX.klicArchivu(Object.assign({}, A, { price: 1 })), true);

  /* Portály si mění slug za číslem inzerátu. Týž inzerát 1008268 byl
     15. 9. na adrese …/1008268-nabidka-prodej-pozemku a 16. 9. na
     …/1008268-nabidka-prodej-pozemku-horni-nemci. Podle celé adresy to
     vypadalo jako zmizení a nová nabídka — a takhle v archivu vzniklo
     48 falešných zmizení. */
  const S1 = { place: 'Horní Němčí', parcel: '—', okres: 'Uherské Hradiště', lat: 48.9262, lng: 17.6151,
    area: 735, price: 22500, url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/1008268-nabidka-prodej-pozemku' };
  const S2 = Object.assign({}, S1, { url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/1008268-nabidka-prodej-pozemku-horni-nemci' });
  je('změna slugu za číslem inzerátu klíč nemění',
    KLICX.klicArchivu(S1) === KLICX.klicArchivu(S2), true);
  je('ale jiné číslo inzerátu ano',
    KLICX.klicArchivu(S1) !== KLICX.klicArchivu(Object.assign({}, S1,
      { url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/1008269-nabidka' })), true);
  je('http, www a parametry v adrese klíč nemění',
    KLICX.totoznostZdroje('http://www.a.cz/x/1008268-a/?utm=1#x')
    === KLICX.totoznostZdroje('https://a.cz/x/1008268-b'), true);
  je('bez adresy rozlišuje výměra, ne cena',
    KLICX.klicArchivu({ place: 'A', okres: 'B', lat: 1, lng: 2, area: 500, price: 9 })
    === KLICX.klicArchivu({ place: 'A', okres: 'B', lat: 1, lng: 2, area: 500, price: 8 }), true);
  je('a dvě různé výměry bez adresy se rozliší',
    KLICX.klicArchivu({ place: 'A', okres: 'B', lat: 1, lng: 2, area: 500 })
    !== KLICX.klicArchivu({ place: 'A', okres: 'B', lat: 1, lng: 2, area: 600 }), true);
}

/* ---- A NA OPRAVDOVÝCH DATECH ----
   Jediná kontrola, která by tu chybu byla našla: v tom, co web ukazuje,
   nesmí být dvě nabídky pod jedním klíčem archivu. A dedup musí jít
   TOUŽ CESTOU jako v aplikaci (PKCisteni.pozemky → PKHlidani.bezDuplicit);
   když jsem to zkusil jen přes bezDuplicit nad surovými daty, vybralo
   to jiného zástupce dvojice než web a z 131 historií se jich na
   nabídky napáslo jen 73. */
{
  const cesta = pathx.join(KOREN_X, 'data', 'opportunities.json');
  if (fsx.existsSync(cesta)) {
    const j = JSON.parse(fsx.readFileSync(cesta, 'utf8'));
    const syrove = (j.opportunities || j).filter((d) => d && d.place && d.okres);
    const cista = PKHX.bezDuplicit(PKCX.pozemky(syrove));
    const poctu = new Map();
    for (const d of cista) {
      const k = KLICX.klicArchivu(d);
      poctu.set(k, (poctu.get(k) || 0) + 1);
    }
    const kolize = [...poctu].filter(([, n]) => n > 1);
    je(`v datech je ${cista.length} nabídek a stejně tolik klíčů archivu`,
      poctu.size, cista.length);
    je('žádné dvě nabídky nesdílí klíč archivu', kolize.slice(0, 3).map(([k]) => k), []);

    /* A pro kontrast: kolik jich kolidovalo na pkey. Kdyby tohle číslo
       spadlo na nulu, je kontrola výš bezzubá a musí se najít jiný
       doklad, že klíč opravdu rozlišuje. */
    const poPkey = new Map();
    for (const d of cista) poPkey.set(KLICX.pkey(d), (poPkey.get(KLICX.pkey(d)) || 0) + 1);
    const kolizePkey = [...poPkey].filter(([, n]) => n > 1).length;
    je(`na hrubém pkey by kolidovaly (${kolizePkey} klíčů) — kontrola výš má co chytat`,
      kolizePkey > 0, true);
  } else {
    je('data/opportunities.json existuje', false, true);
  }
}

console.log('\nArchiv nabídek: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Archiv: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
