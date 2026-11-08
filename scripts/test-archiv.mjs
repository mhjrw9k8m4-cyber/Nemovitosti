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
import { krok, premapujKlice, dnyPrezneceni, verdiktStavu, posledniZaDen, VERZE } from './archiv.mjs';

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

/* ---- 4b) ZMĚNILA SE POLOHA, NE NABÍDKA ----
   Klíč archivu nese souřadnice na tři desetinná místa, takže nabídka,
   které se změní poloha, dostane nový klíč — a archiv to bez párování
   vidí jako „stará zmizela, nová přišla". Naměřeno 8. 11. 2026 na
   živých datech: Bezrealitky se začaly čít povolenou cestou, poloha
   vychází z obce a 3 151 nabídek tím dostalo jiný klíč, přičemž
   2 512 z nich šlo spárovat podle otisku adresy inzerátu. Archiv je
   přírůstkový, takže vymyšlené životnosti by v historii zůstaly
   navždy. */
{
  const sAdresou = (zm) => P(Object.assign(
    { url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/111-nabidka-prodej-pozemku' }, zm || {}));
  const prvni = krok(PRAZDNY, [sAdresou()], '2026-03-01');
  const stary = Object.keys(prvni.stav.nabidky)[0];
  /* Týž inzerát, jiná poloha (obec místo parcely) a táž cena. */
  const posun = krok(prvni.stav, [sAdresou({ lat: 50.4, lng: 15.9 })], '2026-03-02');
  const novy = Object.keys(posun.stav.nabidky)[0];
  je('posunutá nabídka má jiný klíč', novy !== stary, true);
  je('ale nezapíše se jako zmizelá', posun.uzavrene.length, 0);
  je('a drží si den prvního vidění', kde(posun.stav, novy).od, '2026-03-01');
  je('a počítadlo o přestěhování ví', posun.prestehovano, 1);
  /* CENA SE PŘITOM POŘÁD HLÍDÁ: přestěhování nesmí zlevnění spolknout. */
  const slevaPoPosunu = krok(prvni.stav, [sAdresou({ lat: 50.4, lng: 15.9, price: 400000 })], '2026-03-02');
  je('zlevnění při posunu se pořád uzavře jako změna ceny',
    slevaPoPosunu.uzavrene.map((x) => x.proc), ['cena']);
  /* NABÍDKA BEZ ADRESY SE NEPÁRUJE. Záchytný tvar klíče je `#v<výměra>`
     a ten dvě různé nabídky nerozliší — spárovat podle něj by slilo
     dva pozemky v jedné vsi se stejnou výměrou. */
  const bezAdresy = krok(PRAZDNY, [P()], '2026-03-01');
  const posunBez = krok(bezAdresy.stav, [P({ lat: 50.4, lng: 15.9 })], '2026-03-02');
  je('nabídka bez adresy inzerátu se podle výměry nepáruje',
    [posunBez.prestehovano, posunBez.uzavrene.map((x) => x.proc)], [0, ['zmizela']]);
  /* A OPRAVDU ZMIZELÁ NABÍDKA SE POŘÁD UZAVÍRÁ. Kdyby párování bralo
     cokoli, archiv by přestal zapisovat zmizení vůbec. */
  const zmizela = krok(prvni.stav, [], '2026-03-03');
  je('nabídka, která v datech není, se pořád uzavře jako zmizelá',
    zmizela.uzavrene.map((x) => x.proc), ['zmizela']);
}

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
import { pricinaChyb } from './chyby-hlaska.mjs';
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

/* --- KLÍČ POZEMKU BEZ VÝMĚRY --------------------------------------
 * Tohle je past, do které web už jednou spadl: klíč je pkey plus
 * výměra, a když výměra chybí, dosadí se nula — takže dva různé
 * pozemky na týchž souřadnicích dostanou týž klíč. V datech to byla
 * jedna dvojice ve Zlíně (ovocný sad za 758 523 Kč a stavební pozemek
 * za 6 104 Kč) a znamenalo to, že uložit jeden označí oba a poznámka
 * k jednomu se ukáže u druhého.
 *
 * Kontrola nad daty (v test-klic-ulozenych.mjs) tenhle případ chytila
 * jen proto, že zrovna v datech byl. Až ta dvojice z nabídek zmizí,
 * projde i rozbitý klíč. Tyhle tři kontroly proto stojí na VYMYŠLENÝCH
 * nabídkách a platí vždycky. */
{
  const zaklad = { place: 'Zlín', okres: 'Zlín', lat: 49.2271, lng: 17.6664 };
  const sad = { ...zaklad, druh: 'ovocný sad', price: 758523 };
  const stavebni = { ...zaklad, druh: 'stavební pozemek', price: 6104 };
  je('dva pozemky bez výměry se liší klíčem, když se liší druhem',
    KLICX.klicPozemku(sad) !== KLICX.klicPozemku(stavebni), true);
  /* A pozor na druhou stranu: týž pozemek vyvěšený znovu (jiná cena,
     jiný odkaz) musí mít klíč POŘÁD STEJNÝ, jinak by člověku zmizel
     z „Uložených" pokaždé, když majitel nabídku obnoví. */
  je('ale týž pozemek s jinou cenou a jiným odkazem má klíč stejný',
    KLICX.klicPozemku({ ...sad, price: 700000, url: 'https://a.cz/1' })
      === KLICX.klicPozemku({ ...sad, price: 758523, url: 'https://b.cz/2' }), true);
  /* Starý tvar klíče („#v0") se musí dál číst — jinak by se po téhle
     změně ztratilo, co si kdo uložil dřív. */
  je('starý tvar klíče je pořád mezi klíči pro čtení',
    KLICX.kliceProCteni(sad).indexOf(KLICX.pkey(sad) + '#v0') >= 0, true);
  /* A u pozemku S VÝMĚROU se nesmělo změnit vůbec nic. */
  const sVymerou = { ...zaklad, druh: 'orná půda', area: 3732 };
  je('u pozemku s výměrou zůstal klíč beze změny',
    KLICX.klicPozemku(sVymerou) === KLICX.pkey(sVymerou) + '#v3732', true);
}

/* ---- DEN, KDY ZDROJ PŘEZNAČIL IDENTITU, SE NEZAPOČÍTÁVÁ ----------
   Klíč archivu vychází z ADRESY inzerátu. Zdroj, který přes noc změní
   tvar dat (§356), by se tu zapsal jako stovky zmizelých nabídek a
   stovky nových — a archiv je přírůstkový, takže by ten den
   v historii zůstal navždy a statistika „jak rychle nabídky mizí" by
   z něj dostala stovky vymyšlených životností.

   ZNAČKA NESE DEN, ne jen „ano", a to je tu to podstatné: dědí se dál,
   takže podle samotného „ano" by archiv zamrzl natrvalo. */
{
  const DNES = '2026-11-03';
  const VCERA = '2026-11-02';
  je('den přeznačení se z dat pozná',
    dnyPrezneceni([{ prezn: DNES }, { prezn: VCERA }, {}]).has(DNES), true);
  je('a stará dědičná značka dnešek neblokuje',
    dnyPrezneceni([{ prezn: VCERA }]).has(DNES), false);
  je('značka bez dne (jen „ano") se za den nepočítá',
    dnyPrezneceni([{ prezn: 1 }, { prezn: true }]).size, 0);

  /* A ŽE SE TÍM ROBOT OPRAVDU ŘÍDÍ: čte se kód, protože krokDneska
     píše do souborů a zkouška mu je podstrkovat nebude. */
  const kodA = fsx.readFileSync(pathx.join(KOREN_X, 'scripts', 'archiv.mjs'), 'utf8');
  const iK = kodA.indexOf('function krokDneska');
  const telo = iK > 0 ? kodA.slice(iK, iK + 1500) : '';
  je('krokDneska se podle značky opravdu zdrží',
    /dnyPrezneceni\(n\)\.has\(den\)/.test(telo), true);
  /* POZOR: hledat to slovo kdekoli v těle nestačí — stejné slovo stojí
     i v komentáři nad tou podmínkou, takže by kontrola prošla i u robota,
     který se zdrží MLČKY. Komentáře se proto odříznou a slovo se musí
     najít uvnitř té hlášky. */
  const bezKomentaru = telo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  je('a je to vidět v logu, ne mlčky (a ne jen v komentáři)',
    /console\.error\([^;]*NEZAPOČÍTÁVÁ/.test(bezKomentaru), true);
}

/* ---- 9) VERDIKT O ULOŽENÉM STAVU ----
 *
 * Nález sabotážního stroje ze 4. 11.: `test-archiv` nechytila ani
 * obrácenou rovnost (`===` na `!==`), ani záměnu `&&` za `||` — obojí
 * sedělo uvnitř `nactiStav()`, která čte soubor a končí
 * `process.exit(1)`, takže se nedala pustit ze zkoušky vůbec.
 * Rozhodnutí je teď čistá funkce `verdiktStavu` a drží se na všech
 * třech odpovědích. Není to kosmetika: stav s cizí soustavou klíčů
 * přijatý mlčky znamená, že všechno staré vypadá jako zmizelé a
 * všechno nové jako právě přidané — tedy archiv plný výmyslů, a
 * pozná se to až za rok.
 *
 * Výjimka se musí ukázat jako POJMENOVANÁ chyba, ne jako pád celé
 * zkoušky: sabotáž `&& → ||` z téhle funkce udělá `!!s || typeof s
 * === 'object' && typeof s.nabidky === 'object'`, a protože
 * `typeof null === 'object'`, sáhne se na `null.nabidky`. Bez téhle
 * obálky by CI zčervenalo bez jediné hlášky, podle které by se
 * poznalo proč (táž lekce jako u `kde()` výš).
 */
{
  const verdikt = (x) => { try { return verdiktStavu(x); } catch (e) { return 'SPADLO: ' + (e && e.message); } };
  je('stav téže verze se přijme', verdikt({ verze: VERZE, nabidky: {} }), 'ok');
  je('stav starší verze se NEpřijme (jinak by archiv plodil výmysly)',
    verdikt({ verze: VERZE - 1, nabidky: {} }), 'stará');
  je('a novější taky ne', verdikt({ verze: VERZE + 1, nabidky: {} }), 'stará');
  je('žádný stav je „nic", ne „ok"', verdikt(null), 'nic');
  je('a nejde o stav, co nemá nabídky', verdikt({ verze: VERZE }), 'nic');
  /* A ŽE TO SEDÍ NA TO, CO JE OPRAVDU V REPOZITÁŘI. Tohle je jediná
     kontrola, která chytí posunuté číslo VERZE: fixtury si verzi
     berou z modulu, takže se posunou s ním, kdežto soubor na disku
     ne. A kdyby se rozešly, robot při prvním běhu skončí chybou. */
  const naDisku = JSON.parse(fsx.readFileSync(pathx.join(KOREN_X, 'data', 'archiv', 'stav.json'), 'utf8'));
  je('a uložený stav v repozitáři je té verze, kterou kód umí přečíst',
    verdiktStavu(naDisku), 'ok');
}

/* ---- 10) POSLEDNÍ OTISK DNE, NE PRVNÍ ----
 *
 * Zpětný dopočet projde historii gitu a z každého dne si vezme
 * POSLEDNÍ commit dat. Dřív bral první — a protože robot běží
 * čtyřikrát denně a zdroje blikají, nabídka, která se do večera
 * vrátila, vypadala podle prvního běhu dne jako zmizelá. Oprava
 * byla, ale zkouška k ní ne: kus kódu seděl uvnitř `zpetne()`, která
 * si sama pouští `git log`. Sabotážní stroj tam zrušil
 * `filter(Boolean)` a nikdo se neozval (nález ze 4. 11.).
 */
{
  je('z prázdné historie nevznikne žádný den', posledniZaDen('').length, 0);
  je('a mezery nejsou historie', posledniZaDen('   \n  \n').length, 0);
  const log = 'aaa1 2026-01-01\nbbb2 2026-01-01\nccc3 2026-01-01\nddd4 2026-01-02';
  je('ze čtyř commitů ve dvou dnech zůstanou dva', posledniZaDen(log).length, 2);
  je('a z každého dne ten POSLEDNÍ, ne první',
    posledniZaDen(log), ['ccc3 2026-01-01', 'ddd4 2026-01-02']);
  je('dny zůstanou v pořadí, jak přišly (git --reverse: od nejstaršího)',
    posledniZaDen(log).map((r) => r.slice(5)), ['2026-01-01', '2026-01-02']);
}

/* ---- 4c) DRUHÝ BĚH TÉHOŽ DNE: KLÍČE SE SROVNAT MUSÍ ----
   `krokDneska()` se při druhém běhu dne otočí ve dveřích („dnešek už je
   započítaný") — a dokud se s ním otáčelo i PŘEJMENOVÁNÍ klíčů, archiv
   o přesunutých nabídkách přestal vědět. Naměřeno 8. 11. 2026, kdy
   robot běžel podruhé s opraveným semenem rozptylu: archiv znal 3 415
   živých, soubor 3 419, a 3 247 z nich archiv nepoznával.
   premapujKlice() proto umí jen přejmenování: nic nezavírá, dny
   nepočítá a `od` ani `videno` nesahá. */
{
  const A = P({ url: 'https://e.cz/1-nabidka-prodej-pozemku-kolin' });
  const B = Object.assign({}, A, { lat: 50.4, lng: 15.9 });   // tentýž inzerát, jiný bod
  const stav = krok(PRAZDNY, [A], '2026-02-01').stav;
  const kA = Object.keys(stav.nabidky)[0];
  const m = premapujKlice(stav, [B]);
  const kB = KLICX.klicArchivu(B);
  je('přesunutá nabídka dostane nový klíč, ale zůstane táž',
    [m.premapovano, !!m.nabidky[kB], !m.nabidky[kA]], [1, true, true]);
  je('a nepřibude ani neubude', Object.keys(m.nabidky).length, 1);
  je('a datum, odkdy visí, se nemění', m.nabidky[kB] && m.nabidky[kB].od, stav.nabidky[kA].od);
  /* Nabídka BEZ adresy inzerátu (dražba z registru) se páruje obsahem. */
  const C = P({ place: 'Hora', okres: 'Beroun', parcel: '—', price: 123456, area: 777 });
  const D = Object.assign({}, C, { lat: 49.1, lng: 14.1 });
  const stav2 = krok(PRAZDNY, [C], '2026-02-01').stav;
  const m2 = premapujKlice(stav2, [D]);
  je('bezadresná nabídka se spáruje obsahem záznamu',
    [m2.premapovano, !!m2.nabidky[KLICX.klicArchivu(D)]], [1, true]);
  /* A DVĚ K NEROZEZNÁNÍ SE NEPÁRUJÍ VŮBEC. Stav se tu skládá ručně:
     přes krok() se takový případ nedá vyrobit, protože dvě nabídky se
     shodným záznamem odstraní PKHlidani.bezDuplicit dřív, než se k
     archivu dostanou. Ta pojistka je tedy psaná pro stav, který v
     souboru zůstal z dřívějška — a zkouška ji musí umět vyrobit, jinak
     by se tvrdilo něco, co nikdo nezměřil. */
  const zaz = { c: 123456, v: 777, m: 'Hora', o: 'Beroun', dr: 'orná půda', t: 'sale' };
  const stav3 = { verze: VERZE, den: '2026-02-01', nabidky: {
    'Hora|—|Beroun|50.000|15.200#v777': Object.assign({ od: '2026-01-01', videno: '2026-02-01' }, zaz),
    'Hora|—|Beroun|48.500|16.500#v777': Object.assign({ od: '2026-01-01', videno: '2026-02-01' }, zaz),
  } };
  const m3 = premapujKlice(stav3, [D]);
  je('ale dvě k nerozeznání se nespárují vůbec', m3.premapovano, 0);
}

console.log('\nArchiv nabídek: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Archiv: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log('\nVšechny prošly.\n');
