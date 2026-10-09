// Test: sedí okres, do kterého pozemek zařadíme?
//
// Spuštění: node scripts/test-okres.mjs   (nepotřebuje prohlížeč ani síť)
//
// Okres se u inzerátů, které ho sami neuvádějí, dopočítává ze souřadnic.
// Dřív se hledalo NEJBLIŽŠÍ OKRESNÍ MĚSTO — a to je dvakrát vedle:
// nejbližší město není okres, ve kterém obec leží, a vzdálenost se navíc
// počítala ve stupních, jako by stupeň zeměpisné délky byl stejně dlouhý
// jako stupeň šířky (u nás je o třetinu kratší). Holedeč v okrese Louny
// tak na webu visela jako okres Most. Takovou chybu člověk z kraje pozná
// okamžitě — a přestane věřit i všemu ostatnímu.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { okresPodleGPS, okresPodleHranice, maHranice, nejblizsiOkresniMesto } from './okres-podle-gps.mjs';
import { postavHrube } from './generate-okresy-hrube.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Obce, u kterých se dá okres ověřit v katastru ---------------- */
// Schválně jsou vybrané takové, které leží blízko hranice okresu — na
// nich se pozná, jestli se počítá s hranicí, nebo jen s nejbližším městem.
const OBCE = [
  ['Holedeč', 50.2497, 13.5847, 'Louny'],
  ['Veselí nad Lužnicí', 49.18667, 14.69895, 'Tábor'],
  ['Milevsko', 49.4500, 14.3600, 'Písek'],
  ['Týnec nad Labem', 50.0400, 15.3400, 'Kolín'],
  ['Úštěk', 50.5883, 14.3167, 'Litoměřice'],
  ['Česká Kamenice', 50.7970, 14.4180, 'Děčín'],
  ['Koberovy', 50.6300, 15.2400, 'Jablonec nad Nisou'],
  ['Praha (střed)', 50.0875, 14.4213, 'Praha'],
  ['Brno (střed)', 49.1951, 16.6068, 'Brno-město'],
  ['Ostrava (střed)', 49.8209, 18.2625, 'Ostrava-město'],
];
pravda('hranice okresů jsou v repozitáři', maHranice(),
  'chybí data/okresy-hranice.json — okres by se zase jen hádal podle nejbližšího města');
for (const [jmeno, lat, lng, ceka] of OBCE) {
  const vyslo = okresPodleGPS(lat, lng);
  pravda(`${jmeno} → okres ${ceka}`, vyslo === ceka, `vyšlo: ${vyslo}`);
}

/* --- 2) Proč to nejde dělat podle nejbližšího města ------------------ */
// Kdyby někdo v budoucnu hranice zahodil a vrátil se k nejbližšímu městu,
// tahle kontrola mu ukáže, že to není totéž.
const mestem = OBCE.filter(([, lat, lng, ceka]) => nejblizsiOkresniMesto(lat, lng) !== ceka);
pravda('nejbližší okresní město by některé obce zařadilo jinam (proto hranice)',
  mestem.length > 0,
  'na téhle sadě obcí by stačilo i nejbližší město — zkouška nic neověřuje');

/* --- 3) Data na webu: sedí okres u pozemků se souřadnicemi? ---------- */
const data = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const nabidky = data.opportunities || [];
let mimo = 0;
const ukazky = [];
for (const o of nabidky) {
  // SPÚ i dražby okres samy uvádějí (z katastru), souřadnice jsou jen
  // přibližné místo obce — rozpor tam neznamená chybu v zařazení.
  if (!/Bezrealitky|Sreality/i.test(o.extra || '')) continue;
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
  const podleHranice = okresPodleGPS(o.lat, o.lng);
  if (podleHranice && podleHranice !== o.okres) {
    mimo++;
    if (ukazky.length < 5) ukazky.push(`${o.place}: uvedeno ${o.okres}, leží v okrese ${podleHranice}`);
  }
}
pravda('žádný inzerát nevisí v cizím okrese', mimo === 0,
  `${mimo} pozemků má jiný okres, než ve kterém leží:\n      ` + ukazky.join('\n      '));

/* --- 4) Hrubé hranice pro formulář: rezerva a záchyt ----------------

   Do prohlížeče posíláme proředěné hranice (data/okresy-hrube.json, 35 kB
   místo megabajtu). Proředěná čára neleží tam, kde ta skutečná, takže se
   s ní nedá říct „tenhle bod je za hranicí". Kontrola v js/kontrola.js se
   proto ptá jinak — „je bod od vybraného okresu dál než 5 km?" — a stojí
   a padá se dvěma čísly:

     REZERVA — jak daleko „vně" vlastního okresu může vyjít bod, který tam
               ve skutečnosti patří. Musí zůstat hluboko pod prahem, jinak
               by kontrola křičela na poctivě vyplněné inzeráty.
     ZÁCHYT  — kolik procent špatných dvojic obec–okres práh odhalí.

   Obojí se měří na všech skutečných pozemcích v datech, ne na pár ručně
   vybraných bodech. Kdyby někdo zvedl toleranci proředění nebo snížil
   práh, spadne to tady, ne až u uživatele. */
const HRUBE_SOUBOR = path.join(KOREN, 'data', 'okresy-hrube.json');
pravda('hrubé hranice pro formulář jsou v repozitáři', existsSync(HRUBE_SOUBOR),
  'chybí data/okresy-hrube.json — spusťte node scripts/generate-okresy-hrube.mjs');

if (existsSync(HRUBE_SOUBOR)) {
  const hrubeText = readFileSync(HRUBE_SOUBOR, 'utf8');
  const HRUBE = JSON.parse(hrubeText);
  pravda('hrubé hranice mají všech 77 okresů', Object.keys(HRUBE).length === 77,
    `je jich ${Object.keys(HRUBE).length}`);

  /* Soubor je generovaný. Kdyby ho někdo upravil ručně nebo zapomněl
     přegenerovat po změně přesných hranic, tichem by to neprošlo. */
  const znovu = JSON.stringify(postavHrube(
    JSON.parse(readFileSync(path.join(KOREN, 'data', 'okresy-hranice.json'), 'utf8'))));
  pravda('hrubé hranice sedí s přesnými (soubor je přegenerovaný)', znovu === hrubeText,
    'data/okresy-hrube.json neodpovídá data/okresy-hranice.json — spusťte node scripts/oprav.mjs');

  const kB = Buffer.byteLength(hrubeText) / 1024;
  pravda(`hrubé hranice se vejdou do 60 kB (${kB.toFixed(0)} kB)`, kB < 60,
    'soubor se stahuje při odesílání formuláře — nesmí nabobtnat');

  /* Kontrola z prohlížeče, načtená v Node. Seznam okresů si bere
     z js/hlidani-logika.js, na stránce jsou oba soubory vedle sebe. */
  globalThis.window = globalThis;
  const vyzaduj = createRequire(import.meta.url);
  globalThis.PKHlidani = vyzaduj(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const K = vyzaduj(path.join(KOREN, 'js', 'kontrola.js'));
  pravda('kontrola poloha() existuje', typeof K.poloha === 'function');

  let nejdal = 0, nejdalKde = '—', poplachu = 0, prvniPoplach = '—', mereno = 0;
  let dvojic = 0, chyceno = 0;
  for (const o of nabidky) {
    if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
    /* Přísně: okres, ve kterém bod SKUTEČNĚ leží. okresPodleGPS by pro
       bod za hranicí státu vrátil nejbližší okresní město a měřilo by se
       proti okresu, ve kterém pozemek není. */
    const spravny = okresPodleHranice(o.lat, o.lng);
    if (!spravny) continue;
    mereno++;
    // REZERVA — proti okresu, ve kterém bod podle PŘESNÉ hranice leží.
    const km = K._kmVenZOkresu(o.lat, o.lng, HRUBE[spravny]);
    if (km > nejdal) { nejdal = km; nejdalKde = `${o.place} (${spravny})`; }
    if (km > K.PRAH_KM) { poplachu++; if (prvniPoplach === '—') prvniPoplach = `${o.place} (${spravny})`; }
    // ZÁCHYT — proti všem ostatním okresům.
    for (const jiny of Object.keys(HRUBE)) {
      if (jiny === spravny) continue;
      dvojic++;
      if (K._kmVenZOkresu(o.lat, o.lng, HRUBE[jiny]) > K.PRAH_KM) chyceno++;
    }
  }
  pravda(`měří se na skutečných datech (${mereno} pozemků, ${dvojic} dvojic)`,
    mereno > 1500 && dvojic > 100000, 'málo bodů — měření pod ním nic neznamená');
  pravda('žádný správně zadaný pozemek kontrola neodmítne', poplachu === 0,
    `${poplachu} pozemků by dostalo hlášku o špatném okrese, první ${prvniPoplach}`);
  pravda(`rezerva je aspoň dvojnásobná (nejhorší správný bod ${nejdal.toFixed(2)} km vně, práh ${K.PRAH_KM} km)`,
    nejdal < K.PRAH_KM / 2,
    `nejhorší správný bod ${nejdal.toFixed(2)} km vně (${nejdalKde}) — práh je moc těsný`);
  const zachyt = 100 * chyceno / dvojic;
  pravda(`špatný okres kontrola odhalí aspoň v 95 % případů (${zachyt.toFixed(1)} %)`,
    zachyt >= 95, 'práh propouští příliš mnoho špatných dvojic obec–okres');

  /* Že se podle naměřeného čísla opravdu rozhoduje — jinak by výše
     uvedená měření mohla platit a kontrola přesto mlčet. */
  pravda('Kolín na souřadnicích Kolína projde', K.poloha(50.0274, 15.2006, 'Kolín', HRUBE).ok);
  const daleko = K.poloha(50.0274, 15.2006, 'Cheb', HRUBE);
  pravda('Kolín zadaný jako Cheb neprojde', !daleko.ok, JSON.stringify(daleko));
  pravda('hláška řekne kolik km a který okres to je',
    !!daleko.msg && /\d+[\s\u00a0]km/.test(daleko.msg) && daleko.msg.indexOf('Kolín') > -1,
    daleko.msg);
  // Bez hranic (nenačetly se) se nehádá — inzerát nesmí uvíznout.
  pravda('bez načtených hranic kontrola pustí dál', K.poloha(50.0274, 15.2006, 'Cheb', null).ok);
  // Neznámý okres i chybějící souřadnice řeší jiné kontroly, ne poloha().
  pravda('neznámý okres poloha() neřeší', K.poloha(50.0274, 15.2006, 'Xyzabc', HRUBE).ok);
  pravda('bez souřadnic poloha() neřeší', K.poloha(null, null, 'Cheb', HRUBE).ok);
}

/* ---------- Dražba po termínu nepatří do výpisu ----------
   Aplikace ji z výpisu, z mapy i z počtů vyřazuje — „dražit se nedá".
   Generované stránky krajů a okresů to dlouho nedělaly, a přitom jsou to
   právě ony, na které lidé chodí z vyhledávačů: tři dražby s termínem
   včerejška na nich stály jako nabídka, zatímco mapa je už nepočítala.
   Dvě odpovědi na tutéž otázku na témž webu.
   Zdroj je drží jako „Uveřejněno", dokud je nezpracuje, a mezi dvěma běhy
   robota (6 h) termín projít může — okno tedy musí zavřít obě strany. */
{
  const DNES = new Date(); DNES.setHours(0, 0, 0, 0);
  const stranky = readdirSync(KOREN)
    .filter((f) => /^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f));
  let sTerminem = 0;
  const prosle = [];
  for (const f of stranky) {
    const html = readFileSync(path.join(KOREN, f), 'utf8');
    for (const m of html.matchAll(/<div class="okr-item"[\s\S]*?<\/div>/g)) {
      const den = /(\d{1,2})\.[\s\u00a0](\d{1,2})\.[\s\u00a0](\d{4})/.exec(m[0]);
      if (!den) continue;
      sTerminem++;
      const t = new Date(+den[3], +den[2] - 1, +den[1]);
      if (!isNaN(t) && t < DNES) prosle.push(`${f}: ${den[0]}`);
    }
  }
  /* Pojistka: kdyby se tvar řádku změnil a datum se přestalo nacházet,
     kontrola níž by prošla na prázdnu a mlčela by napořád. */
  pravda('na regionálních stránkách se našly dražby s termínem', sTerminem >= 20,
    `řádků s datem: ${sTerminem} na ${stranky.length} stránkách`);
  pravda('a žádná z nich nemá termín v minulosti', prosle.length === 0,
    prosle.slice(0, 5).join(', ') + (prosle.length > 5 ? ` …a dalších ${prosle.length - 5}` : ''));
}

/* ---- OKRES → KRAJ SMÍ BÝT JEN NA JEDNOM MÍSTĚ -----------------
   Tabulka o 78 položkách ležela v repozitáři TŘIKRÁT: js/ceny.js,
   js/main.js a scripts/generate-region-pages.mjs. Všechny tři tehdy
   souhlasily — jenže tenhle repozitář už má svou historii rozejitých
   kopií (cenový verdikt, termíny dražeb, adresa snímku) a každá z nich
   se poznala až tím, že web o téže věci tvrdil dvě různé věci.
   Sestavení stránek si ji teď bere z js/ceny.js. V js/main.js zůstat
   MUSÍ: hlidani.html a zpravy.html ho načítají bez js/ceny.js, takže
   by tam PK_CENY nebylo. Na dvě kopie tedy dohlíží tahle kontrola. */
{
  const vytahni = (soubor, zacatek) => {
    const t = readFileSync(path.join(KOREN, soubor), 'utf8');
    const i = t.indexOf(zacatek);
    if (i < 0) return null;
    const j = t.indexOf('{', i);
    const k = t.indexOf('};', j);
    if (j < 0 || k < 0) return null;
    const blok = t.slice(j, k + 1);
    const out = {};
    for (const m of blok.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) out[m[1]] = m[2];
    return out;
  };
  const vCenach = vytahni('js/ceny.js', 'OKRES_KRAJ =');
  const vMape = vytahni('js/main.js', 'var OKRES_KRAJ =');
  pravda('tabulka okres → kraj se našla v js/ceny.js i v js/main.js',
    !!vCenach && !!vMape && Object.keys(vCenach).length > 70 && Object.keys(vMape).length > 70,
    `ceny.js: ${vCenach ? Object.keys(vCenach).length : 'nenašlo'}, `
    + `main.js: ${vMape ? Object.keys(vMape).length : 'nenašlo'}`);
  if (vCenach && vMape) {
    const klice = [...new Set([...Object.keys(vCenach), ...Object.keys(vMape)])];
    const rozdily = klice.filter((k) => vCenach[k] !== vMape[k]);
    pravda(`a obě kopie říkají totéž (${klice.length} okresů)`,
      rozdily.length === 0,
      rozdily.slice(0, 5).map((k) => `${k}: ceny.js „${vCenach[k] || '—'}" vs main.js „${vMape[k] || '—'}"`).join('; '));
  }
  /* A že si generátor stránek svou kopii opravdu nedrží. */
  const gen = readFileSync(path.join(KOREN, 'scripts', 'generate-region-pages.mjs'), 'utf8');
  pravda('a generátor stránek si tabulku neopisuje',
    /const OKRES_KRAJ = \(CENY && CENY\.OKRES_KRAJ\)/.test(gen)
    && !/const OKRES_KRAJ = \{/.test(gen),
    'generate-region-pages.mjs má tabulku napsanou vlastním výčtem');
}

console.log('\nZařazení pozemku do okresu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Okresy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
