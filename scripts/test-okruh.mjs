// Test: okruh kolem místa — „pozemky do 30 km od Brna".
//
// Spuštění: node scripts/test-okruh.mjs   (nepotřebuje prohlížeč ani síť)
//
// Čtyři věci, na kterých okruh stojí, a každá se dá porušit tiše:
//
//  1. VZDÁLENOST. Jeden haversine pro mapu, filtr i stránku pozemku.
//     Zkouší se proti známé vzdálenosti Brno–Praha; kdyby se do něj
//     dostal převod stupňů na radiány obráceně, čísla by pořád vycházela
//     „nějak" a nikdo by si toho nevšiml.
//  2. DRUHÝ PÁD. „od Brna", „od Plzně", „od Liberce", „od Českých
//     Budějovic" — koncovka je jiná pokaždé. Porovnává se kmen, takže
//     test musí držet oba seznamy: co se spojit MUSÍ a co se spojit NESMÍ.
//  3. KOPIE SOUŘADNIC. js/okruh.js má tabulku okresních měst opsanou
//     z data/okresy.json, aby mapa nemusela stahovat čtvrtý soubor.
//     Dvě kopie téhož se v tomhle projektu už jednou rozešly.
//  4. NÁZEV, KTERÝ SE UKÁŽE. Okres „Brno-venkov" není obec; ve větě
//     „do 30 km od…" musí stát „Brna". Ale „Frýdek-Místek" se dělit nesmí.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const O = req(path.join(ROOT, 'js', 'okruh.js'));
const H = req(path.join(ROOT, 'js', 'hledani.js'));
const D = req(path.join(ROOT, 'js', 'dotaz.js'));
const DATA = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const OKRESY = JSON.parse(readFileSync(path.join(ROOT, 'data', 'okresy.json'), 'utf8')).okresy;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 0) Předpoklady ---------------------------------------------------
   Bez dat by většina tvrzení níž platila o prázdnu. */
{
  const sSouradnici = DATA.filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number').length;
  pravda('data mají dost nabídek se souřadnicí (jinak neměří nic)',
    sSouradnici > 1000, `${sSouradnici} z ${DATA.length}`);
  pravda('data/okresy.json má všech 77 okresů',
    Object.keys(OKRESY).length === 77, `${Object.keys(OKRESY).length}`);
}

/* --- 1) Vzdálenost ---------------------------------------------------- */
{
  const brno = { lat: 49.195, lng: 16.608 }, praha = { lat: 50.083, lng: 14.421 };
  const d = O.km(brno, praha);
  // Vzdušnou čarou je to 184 km. Mez je schválně úzká: kdyby se spletly
  // radiány se stupni, vyjde 10 666 km; kdyby se prohodila šířka s délkou, 243 km.
  pravda('Brno–Praha vyjde 184 km (±4)', Math.abs(d - 184) <= 4, `${d.toFixed(1)} km`);
  pravda('stejný bod je nula km', O.km(brno, brno) === 0, String(O.km(brno, brno)));
  pravda('vzdálenost je symetrická', Math.abs(O.km(brno, praha) - O.km(praha, brno)) < 1e-9);
  pravda('bez souřadnice vrací nekonečno, ne nulu',
    O.km(brno, { lat: null, lng: null }) === Infinity && O.km(null, praha) === Infinity);
  pravda('rozbité číslo (NaN, Infinity) nevrací „blízko"',
    O.km(brno, { lat: NaN, lng: 16 }) === Infinity && O.km(brno, { lat: Infinity, lng: 16 }) === Infinity);
}

/* --- 2) Normalizace je společná s hledáním ---------------------------- */
{
  const vzorky = ['Brno-město', 'České Budějovice', 'Ústí nad Labem', 'Žďár nad Sázavou',
    'Mělník', 'Lovečkovice', 'Praha-východ', 'Frýdek-Místek'];
  const rozdily = vzorky.filter((v) => O.norm(v) !== H.norm(v));
  pravda('okruh normalizuje názvy stejně jako hledání',
    rozdily.length === 0, rozdily.map((v) => `${v}: ${O.norm(v)} ≠ ${H.norm(v)}`).join(', '));
}

/* --- 3) Tabulka okresních měst je kopie, která se nesmí rozejít ------- */
{
  const mesta = O.OKRESNI_MESTA;
  const chybi = Object.keys(OKRESY).filter((k) => !mesta[k]);
  const navic = Object.keys(mesta).filter((k) => !OKRESY[k]);
  const jine = Object.keys(OKRESY).filter((k) => mesta[k]
    && (mesta[k][0] !== OKRESY[k][0] || mesta[k][1] !== OKRESY[k][1]));
  pravda('v tabulce nechybí žádný okres z data/okresy.json', chybi.length === 0, chybi.join(', '));
  pravda('v tabulce není okres, který v datech není', navic.length === 0, navic.join(', '));
  pravda('souřadnice se nerozešly ani v jednom okrese', jine.length === 0,
    jine.map((k) => `${k}: ${mesta[k]} ≠ ${OKRESY[k]}`).join('; '));
}

/* --- 4) Druhý pád: co se spojit musí a co nesmí ----------------------- */
{
  const musi = [['brna', 'brno'], ['prahy', 'praha'], ['plzne', 'plzen'], ['liberce', 'liberec'],
    ['melnika', 'melnik'], ['ceskych', 'ceske'], ['budejovic', 'budejovice'],
    ['jihlavy', 'jihlava'], ['olomouce', 'olomouc'], ['zlina', 'zlin'], ['loun', 'louny'],
    ['hradce', 'hradec'], ['tabora', 'tabor'], ['znojma', 'znojmo']];
  const nesmi = [['kolin', 'kladno'], ['tabora', 'trutnov'], ['brna', 'praha'],
    ['most', 'melnik'], ['cheb', 'chomutov'], ['pisku', 'plzen']];
  const spatne = musi.filter((p) => !O.kmenSedi(p[0], p[1]));
  const prebrane = nesmi.filter((p) => O.kmenSedi(p[0], p[1]));
  pravda(`všech ${musi.length} tvarů 2. pádu se spojí se svým názvem`,
    spatne.length === 0, spatne.map((p) => p.join(' ↮ ')).join(', '));
  pravda('a žádná dvě různá města se nespojí',
    prebrane.length === 0, prebrane.map((p) => p.join(' = ')).join(', '));
  pravda('kratší dotaz smí sednout na delší název, obráceně ne',
    O.nazevSedi(['usti'], ['usti', 'nad', 'labem']) > 0
    && O.nazevSedi(['usti', 'nad', 'labem'], ['usti']) === 0);
}

/* --- 5) Název → souřadnice ------------------------------------------- */
{
  const zkousky = [['brna', 'Brno'], ['prahy', 'Praha'], ['plzne', 'Plzeň'],
    ['liberce', 'Liberec'], ['melnika', 'Mělník'], ['ceskych budejovic', 'České Budějovice'],
    ['usti nad labem', 'Ústí nad Labem'], ['hradce kralove', 'Hradec Králové'],
    ['frydku mistku', 'Frýdek-Místek'], ['jihlavy', 'Jihlava'], ['olomouce', 'Olomouc']];
  const spatne = [];
  for (const [dotaz, cekame] of zkousky) {
    const s = O.stred(DATA, dotaz);
    if (!s || s.nazev !== cekame) spatne.push(`${dotaz} → ${s ? s.nazev : 'NIC'} (čekáno ${cekame})`);
  }
  pravda(`všech ${zkousky.length} okresních měst se najde i ve 2. padě`,
    spatne.length === 0, spatne.join('; '));

  // Obec, která okresním městem není: střed se vezme z jejích pozemků.
  const lov = O.stred(DATA, 'lovečkovic');
  pravda('obec mimo okresní města se najde z nabídek',
    !!lov && lov.zdroj === 'obec' && lov.nazev === 'Lovečkovice' && lov.pocet > 1,
    JSON.stringify(lov));
  // A ten střed musí ležet v okolí svých pozemků, ne někde v republice.
  const jejich = DATA.filter((d) => d.place === 'Lovečkovice');
  const nejdal = Math.max(...jejich.map((d) => O.km(lov, d)));
  pravda('střed obce leží mezi jejími pozemky (do 15 km)', nejdal < 15, `${nejdal.toFixed(1)} km`);

  pravda('nesmysl nevrátí tiše náhodné místo',
    O.stred(DATA, 'qwertzuiop') === null && O.stred(DATA, '') === null);
}

/* --- 6) Název, který se ukáže ve větě -------------------------------- */
{
  pravda('„Brno-venkov" se ve větě ukáže jako „Brno"', O.nazevMesta('Brno-venkov') === 'Brno');
  pravda('„Praha-východ" jako „Praha"', O.nazevMesta('Praha-východ') === 'Praha');
  pravda('„Plzeň-jih" jako „Plzeň"', O.nazevMesta('Plzeň-jih') === 'Plzeň');
  pravda('ale „Frýdek-Místek" zůstane celý',
    O.nazevMesta('Frýdek-Místek') === 'Frýdek-Místek');
  pravda('a „Ústí nad Labem" taky', O.nazevMesta('Ústí nad Labem') === 'Ústí nad Labem');
}

/* --- 7) Mez okruhu --------------------------------------------------- */
{
  pravda('okruh 30 km je platný', D.platnyOkruh(30));
  pravda('nula a zápor ne', !D.platnyOkruh(0) && !D.platnyOkruh(-5));
  pravda('a 5 000 km taky ne (to je omyl v jednotce)', !D.platnyOkruh(5000));
  pravda('text ani NaN neprojdou', !D.platnyOkruh('30') && !D.platnyOkruh(NaN));
  pravda('mez je jen na jednom místě — js/okruh.js svou vlastní nemá',
    typeof O.platnyOkruh === 'undefined' && typeof O.MAX_KM === 'undefined');
}

/* --- 8) Celá věta: parser + okruh ------------------------------------ */
{
  const r = D.rozeber('do 30 km od Brna');
  pravda('„do 30 km od Brna" se přečte jako okruh 30 km kolem Brna',
    r.okruh === 30 && r.okruhMisto === 'brna', JSON.stringify(r));
  pravda('a místo nezůstane zároveň hledaným textem (to by vrátilo nulu)',
    r.text === '', JSON.stringify(r.text));
  const r2 = D.rozeber('les do 10 km od Jihlavy');
  pravda('„les do 10 km od Jihlavy" si vezme i druh',
    r2.okruh === 10 && r2.druh === 'Lesní pozemek' && r2.okruhMisto === 'jihlavy',
    JSON.stringify(r2));
  const r3 = D.rozeber('orná půda 50 km od Brna do 500 tis');
  pravda('okruh, druh i cena v jedné větě',
    r3.okruh === 50 && r3.druh === 'Orná půda' && r3.cenaDo === 500000
    && r3.okruhMisto === 'brna', JSON.stringify(r3));
  // Křížek u odznaku maže slova, ze kterých odznak vznikl. U okruhu k nim
  // patří i místo — po zrušení nesmí v políčku zůstat „od Brna" samotné.
  const cast = (r.casti || []).filter((c) => c.druh === 'okruh')[0];
  pravda('odznak okruhu si pamatuje i slova místa',
    !!cast && (cast.slova || []).indexOf('brna') >= 0, JSON.stringify(cast));
  const r4 = D.rozeber('5000 km od Brna');
  pravda('nesmyslný okruh se nenastaví (a slovo se nespolkne)',
    !r4.okruh, JSON.stringify(r4));
  const r5 = D.rozeber('kolem Brna do 20 kilometrů');
  pravda('„do 20 kilometrů" je taky okruh', r5.okruh === 20, JSON.stringify(r5));
  const r6 = D.rozeber('pozemek do 2 ha u Brna');
  pravda('„do 2 ha" zůstane výměrou, ne okruhem',
    !r6.okruh && r6.plochaDo === 20000, JSON.stringify(r6));

  // A co z toho vyjde na datech: musí to být neprázdný, ale ne celý výpis.
  const stred = O.stred(DATA, r.okruhMisto);
  const uvnitr = DATA.filter((d) => O.km(stred, d) <= r.okruh);
  pravda('okruh 30 km od Brna něco najde', uvnitr.length > 20, `${uvnitr.length} nabídek`);
  pravda('a není to celá republika', uvnitr.length < DATA.length / 2,
    `${uvnitr.length} z ${DATA.length}`);
  const venku = DATA.filter((d) => O.km(stred, d) > r.okruh);
  pravda('venku zůstalo, co má (jinak filtr nic nedělá)', venku.length > 100, `${venku.length}`);
  const prespocet = uvnitr.filter((d) => O.km(stred, d) > r.okruh).length;
  pravda('žádná vybraná nabídka není dál než okruh', prespocet === 0, String(prespocet));
}

/* --- 8b) Jak daleko je to do města ----------------------------------
   Věta se skládá na jednom místě (js/okruh.js) a vepisuje ji do stránky
   generátor. Zkouší se na VŠECH pozemcích, protože zrovna tady se chyba
   schová v jednom okrese a nikde jinde se neukáže. */
{
  const texty = DATA.map((d) => ({ d, t: O.popisVzdalenosti(d) }));
  const neprazdne = texty.filter((x) => x.t);
  pravda('vzdálenost se spočítá u skoro všech pozemků',
    neprazdne.length > DATA.length - 50, `${neprazdne.length} z ${DATA.length}`);
  const CAST = String.raw`[^·]+ \d+(,\d)? km`;
  const VZOR = new RegExp('^' + CAST + '( · ' + CAST + ')?$');
  const divne = neprazdne.filter((x) => !VZOR.test(x.t));
  pravda('a má vždycky tvar ukazatele („Kolín 26 km · Praha 30 km")',
    divne.length === 0, divne.slice(0, 3).map((x) => `${x.d.place}: „${x.t}"`).join(' | '));
  const jmena = (t) => t.split(' · ').map((k) => k.replace(/\s+\S+ km$/, ''));
  const dvakrat = neprazdne.filter((x) => {
    const m = jmena(x.t);
    return m.length === 2 && m[0] === m[1];
  });
  pravda('a nepíše totéž město dvakrát', dvakrat.length === 0,
    dvakrat.slice(0, 3).map((x) => `${x.d.place}: „${x.t}"`).join(' | '));
  // Čísla musí být uvěřitelná: republika je 500 km široká.
  const daleko = neprazdne.filter((x) =>
    (x.t.match(/(\d+)(?:,\d)? km/g) || []).some((k) => parseInt(k, 10) > 130));
  pravda('žádná vzdálenost nevyjde nesmyslně velká (> 130 km)', daleko.length === 0,
    daleko.slice(0, 3).map((x) => `${x.d.place}: „${x.t}"`).join(' | '));
  /* OKRES BEZ MĚSTA. „Praha-východ" a „Brno-venkov" město nemají
     a souřadnice v tabulce je u nich jen bod v okrese — kdyby se podle
     ní měřilo, byl by Mukařov 12 km od Prahy (je 25) a Máslovice 25
     (jsou 15). Oba musí vycházet od skutečného středu Prahy. */
  pravda('okres bez vlastního města se jako cíl nebere',
    !O.maMesto('Praha-východ') && !O.maMesto('Brno-venkov') && !O.maMesto('Plzeň-jih')
    && O.maMesto('Brno-město') && O.maMesto('Kolín') && O.maMesto('Frýdek-Místek'));
  const zOkresuBezMesta = neprazdne.filter((x) => !O.maMesto(x.d.okres));
  pravda('a pozemkům v takovém okrese se měří od středu velkého města',
    zOkresuBezMesta.length > 50 && zOkresuBezMesta.every((x) => jmena(x.t).length === 1),
    `${zOkresuBezMesta.length} nabídek`);
  // Nabídky posazené na okresní město (zdroj nedodal GPS) nic netvrdí.
  const nahradni = DATA.filter((d) => O.nahradniSouradnice(d));
  pravda('u nabídek bez vlastních souřadnic se vzdálenost neuvádí',
    nahradni.length > 0 && nahradni.every((d) => O.popisVzdalenosti(d) === ''),
    `${nahradni.length} takových nabídek`);
  // A hotová věta je ve vygenerované stránce — jinak ji nikdo neuvidí.
  const { souborPro } = await import('./generate-parcel-pages.mjs');
  const vzorek = neprazdne.slice(0, 40);
  const chybi = [];
  let nalezeno = 0;
  for (const x of vzorek) {
    const f = path.join(ROOT, souborPro(x.d));
    if (!existsSync(f)) continue;
    nalezeno++;
    const html = readFileSync(f, 'utf8');
    if (html.indexOf('id="pz-okoli-data"') < 0 || html.indexOf(x.t) < 0) chybi.push(souborPro(x.d));
  }
  pravda('vzorek stránek pozemků se vůbec našel (jinak se nekontroluje nic)',
    nalezeno > 20, `${nalezeno} stránek`);
  pravda('a stojí v nich i ta věta o vzdálenostech',
    chybi.length === 0, chybi.slice(0, 3).join(', '));
}

/* --- 9) Je to doopravdy zapojené? ------------------------------------
   Modul může být správný a web ho přitom nenačte ani nepoužije — tak
   vznikla celá tahle třída chyb (naposledy js/klic.js s „defer"). Čte se
   proto i to, co o okruhu stojí v mapě a ve stránce. */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  pravda('index.html načítá js/okruh.js', /<script src="js\/okruh\.js/.test(idx), 'chybí <script>');
  /* Pozice se hledají u ZNAČEK, ne kdekoli v souboru: o js/main.js se
     v index.html mluví i v komentáři nad ovládáním mapy a porovnání
     pak padalo na zmínce, ne na pořadí načítání. */
  const tag = (jm) => idx.indexOf('<script src="' + jm);
  pravda('a dřív než js/main.js, který ho volá',
    tag('js/okruh.js') >= 0 && tag('js/okruh.js') < tag('js/main.js'),
    `okruh na ${tag('js/okruh.js')}, main na ${tag('js/main.js')}`);
  pravda('mapa hledá střed okruhu společným modulem',
    /PKOkruh\.stred\(DATA/.test(main));
  pravda('a okruh je mezi podmínkami výpisu (jinak by filtr nic nedělal)',
    /okOkruh/.test(main) && /&& okOkruh/.test(main));
  pravda('vzdálenost se počítá jen jedním vzorcem',
    /PKOkruh\.km\(a, d\)/.test(main) && !/6371/.test(main),
    main.indexOf('6371') >= 0 ? 'v js/main.js pořád zbyl vlastní haversine' : '');
  pravda('a okruh je vidět i na mapě, ne jen ve výpisu',
    /vykresliOkruhNaMape/.test(main));
  /* Rozřazení druhů smí být jen na jednom místě — v js/ceny.js. */
  const ceny = readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8');
  const poz = readFileSync(path.join(ROOT, 'js', 'pozemek.js'), 'utf8');
  const vlastni = (t) => /indexOf\('travní'\)/.test(t);
  pravda('druhy rozřazuje jediný modul (js/ceny.js)',
    vlastni(ceny) && !vlastni(main) && !vlastni(poz),
    `ceny ${vlastni(ceny)}, main ${vlastni(main)}, pozemek ${vlastni(poz)}`);
}

console.log('\nOkruh kolem místa');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
process.exit(chyb ? 1 : 0);
