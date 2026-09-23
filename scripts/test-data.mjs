// Test: datový soubor si sám neodporuje.
//
// Spuštění: node scripts/test-data.mjs   (bez prohlížeče, běží v sekundě)
//
// Proč: web může být bezvadně naprogramovaný a přesto lhát, protože lžou
// data. Tohle je ten druh chyby, kterou žádný test rozhraní nechytí —
// stránka se vykreslí, nic nespadne, jen je špendlík jinde než pozemek.
//
// Co se stalo: robot si dohledával přesnou polohu podle názvu katastrálního
// území. Okres funkci předával, ale jen do klíče mezipaměti — do DOTAZU ne.
// Ptal se tedy prostě na „Police, Česko" a bral první výsledek. Jenže Polic
// je v Česku víc, a tak nabídka z okresu Vsetín přistála u Jemnice, 177 km
// jinde. Stejně dopadly Rataje (180 km), Lukavec (125), Karlovice (90)
// a Křakov (84). Sedm nabídek mělo špendlík na druhém konci republiky, a to
// se propisovalo i do „pozemků v okolí" a do cen podle kraje.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const pozadavek = createRequire(import.meta.url);

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const data = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const nabidky = data.opportunities || [];
const OKRESY = JSON.parse(readFileSync(new URL('../data/okresy.json', import.meta.url), 'utf8')).okresy || {};

function km(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

pravda('datový soubor něco obsahuje', nabidky.length > 500, `jen ${nabidky.length} nabídek`);

// --- 1) Špendlík patří do okresu, který je u nabídky napsaný ---------
/* Mez 55 km je změřená, ne odhadnutá: u nabídek, jejichž poloha s okresem
   souhlasí, je nejvzdálenější 47 km od jeho středu (medián 12 km,
   devětadevadesátý percentil 30). Padesát pět je tedy nad vším, co je
   v pořádku, a hluboko pod omyly, které byly 84 až 180 km daleko. */
const MEZ_KM = 55;
const daleko = [];
let sSouradnicemi = 0, bezStredu = 0;
for (const o of nabidky) {
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
  sSouradnicemi++;
  const stred = OKRESY[o.okres];
  if (!stred) { bezStredu++; continue; }
  const d = km(stred[0], stred[1], o.lat, o.lng);
  if (d > MEZ_KM) daleko.push(`${o.place} / okres ${o.okres}: ${Math.round(d)} km od středu okresu`);
}
pravda('skoro všechny nabídky mají souřadnice', sSouradnicemi > nabidky.length * 0.95,
  `souřadnice má jen ${sSouradnicemi} z ${nabidky.length}`);
pravda('každý okres v datech známe', bezStredu === 0, `${bezStredu} nabídek má okres, který neznáme`);
pravda('žádný špendlík neleží mimo svůj okres',
  daleko.length === 0,
  `${daleko.length} nabídek: ${daleko.slice(0, 6).join(' | ')}${daleko.length > 6 ? ` … a dalších ${daleko.length - 6}` : ''}`);

// --- 2) Souřadnice vůbec leží v Česku --------------------------------
const mimoCR = nabidky.filter((o) => typeof o.lat === 'number' &&
  (o.lat < 48.5 || o.lat > 51.1 || o.lng < 12.0 || o.lng > 18.9));
pravda('všechny souřadnice leží v Česku', mimoCR.length === 0,
  mimoCR.slice(0, 4).map((o) => `${o.place} ${o.lat},${o.lng}`).join(' | '));

// --- 3) Čísla dávají smysl -------------------------------------------
const zapornaCena = nabidky.filter((o) => o.price != null && !(o.price > 0));
const zapornaVymera = nabidky.filter((o) => o.area != null && !(o.area > 0));
pravda('žádná cena není nula ani záporná', zapornaCena.length === 0, `${zapornaCena.length} nabídek`);
pravda('žádná výměra není nula ani záporná', zapornaVymera.length === 0, `${zapornaVymera.length} nabídek`);
// Výměra nad tisíc hektarů u jedné parcely znamená špatně načtené číslo.
const obri = nabidky.filter((o) => o.area > 1e7);
pravda('žádná výměra není nesmyslně velká', obri.length === 0,
  obri.slice(0, 3).map((o) => `${o.place} ${o.area} m²`).join(' | '));

// --- 4) „Poprvé viděno" je použitelné --------------------------------
const bezData = nabidky.filter((o) => !/^\d{4}-\d{2}-\d{2}$/.test(o.first_seen || ''));
pravda('každá nabídka ví, kdy ji robot viděl poprvé', bezData.length === 0, `${bezData.length} nabídek bez data`);

// --- 5) Termíny dražeb mají jen jednu kopii ---------------------------
/* Tenhle projekt už jednou zaplatil za to, že tentýž výpočet žil ve víc
   souborech: cenový verdikt se ve třech kopiích rozešel a mapa tvrdila
   něco jiného než stránka pozemku. Totéž hrozilo u termínů dražeb —
   daysUntil a countdownText byly doslovně v js/main.js i v js/pozemek.js.
   Teď jsou v js/terminy.js. Tahle kontrola hlídá, ať se nevrátí. */
{
  const ctiJs = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  const modul = ctiJs('terminy.js');
  pravda('sdílený modul termínů existuje a počítá dny',
    /function daysUntil/.test(modul) && /PK_TERMINY/.test(modul));
  for (const f of ['main.js', 'pozemek.js']) {
    const t = ctiJs(f);
    // Vlastní kopie poznáme podle těla výpočtu, ne podle jména funkce —
    // tenké přesměrování na PK_TERMINY je v pořádku.
    /* Tělo se nedá omezit přes [^}]: hned na prvním řádku výpočtu je
       /(\\d{4})-/ a složená závorka uvnitř regulárního výrazu hledání
       utne dřív, než se dojde k samotnému výpočtu. */
    const maKopii = /function (daysUntil|countdownText)[\s\S]{0,420}?(86400000|'proběhlo')/.test(t);
    pravda(`js/${f} nemá vlastní kopii výpočtu termínů`, !maKopii,
      'výpočet se vrátil do souboru — dvě kopie se dřív nebo později rozejdou');
    pravda(`js/${f} sahá na sdílený modul`, /PK_TERMINY/.test(t));
  }
  // Syrové ISO datum patří strojům, ne stránce.
  const zdroj = ctiJs('pozemek.js');
  pravda('stránka pozemku nepíše datum ve tvaru pro stroje',
    /zdrojText\(d\.extra\)/.test(zdroj),
    '„Stav / zdroj" ukazoval „dražba 2026-10-12" místo „dražba 12. 10. 2026"');
}

/* --- Souřadnice od zdroje se musí prověřovat stejně jako dohledané ----
 *
 * Tohle chytil až tenhle test na ostrých datech: oficiální registr dražeb
 * (cevd.gov.cz) poslal u dvou RŮZNÝCH dražeb tytéž souřadnice, a to 350 km
 * od okresu, který stál v jejich vlastní vyhlášce. Robot je do té doby bral
 * jako svaté („přeskakujeme záznamy s reálnou GPS z evidence dražeb").
 * Okres z vyhlášky je přitom spolehlivější než GPS od zdroje, takže když
 * si odporují, vyhrává vyhláška. Kdyby ta kontrola z robota zmizela, chyba
 * by se vrátila a tenhle test by ji sice našel — ale až po dalším běhu,
 * s rozbitými daty na webu. */
{
  const robot = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');
  pravda('robot prověřuje i souřadnice, které dostal od zdroje',
    /if \(!o\._gps\) continue;[\s\S]{0,400}o\._gps = false;/.test(robot),
    'bez toho se špatná GPS z registru dostane na web beze změny');
  // A dvě různé nabídky nesmí sdílet přesně tentýž bod — to je otisk
  // zkopírované nebo zástupné souřadnice, ne náhoda.
  const kde = {};
  for (const o of nabidky) {
    if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
    const k = o.lat.toFixed(6) + ',' + o.lng.toFixed(6);
    (kde[k] = kde[k] || []).push(o.place + ' / ' + o.okres);
  }
  const shodne = Object.entries(kde).filter(([, v]) => new Set(v).size > 1);
  pravda('dvě různé obce nesdílejí přesně tentýž bod', shodne.length === 0,
    shodne.slice(0, 3).map(([k, v]) => k + ': ' + [...new Set(v)].join(' + ')).join(' | '));
}

/* --- Jedno číslo, ne tři ---------------------------------------------
   Úvodní stránka, rozcestník okresů a mapa mluví o tomtéž: kolik je na
   webu pozemků. Každé z nich to ale počítalo po svém — úvod po
   odstranění duplicit, rozcestník ze syrových dat, mapa zase po
   odstranění. Výsledkem byla tři různá čísla pro tutéž věc:
   1 954 / 1 971 / 1 958. Rozcestník navíc sliboval „na jedné mapě" víc,
   než na té mapě doopravdy bylo.
   Duplicity se teď odstraňují jednou při načtení dat v generátoru —
   stejně jako je odstraňuje aplikace. Tenhle test hlídá, že se to
   nerozejde znovu. */
{
  const PKH = pozadavek('../js/hlidani-logika.js');
  const skutecne = PKH.bezDuplicit(nabidky).length;
  const cislo = (t) => parseInt(String(t || '').replace(/[^\d]/g, ''), 10);

  const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const hero = cislo((idx.match(/<b id="hero-n-count">([^<]*)<\/b>/) || [])[1]);
  pravda('úvodní stránka hlásí tolik pozemků, kolik jich opravdu je',
    hero === skutecne, `na stránce ${hero}, v datech po odstranění duplicit ${skutecne}`);

  const roz = readFileSync(new URL('../pozemky-podle-okresu.html', import.meta.url), 'utf8');
  const rozcestnik = cislo((roz.match(/přes <b>([^<]*)<\/b>/) || [])[1]);
  pravda('a rozcestník okresů hlásí totéž',
    rozcestnik === skutecne, `rozcestník ${rozcestnik}, úvod ${hero}, v datech ${skutecne}`);

  /* A po krajích taky — součet přes kraje nesmí být jiný než celek. */
  const CEN = pozadavek('../js/ceny.js');
  const KR = (CEN && CEN.OKRES_KRAJ) || (globalThis.PK_CENY && globalThis.PK_CENY.OKRES_KRAJ) || {};
  const poKraji = {};
  for (const d of PKH.bezDuplicit(nabidky)) { const k = KR[d.okres]; if (k) poKraji[k] = (poKraji[k] || 0) + 1; }
  const naStrance = [...idx.matchAll(/data-kraj="([^"]+)">([^<]*)</g)]
    .map((m) => [m[1], cislo(m[2])]).filter(([, n]) => n > 0);
  pravda('na úvodu jsou vypsané kraje', naStrance.length >= 10, `jen ${naStrance.length}`);
  const neshody = naStrance.filter(([k, n]) => (poKraji[k] || 0) !== n)
    .map(([k, n]) => `${k}: na stránce ${n}, v datech ${poKraji[k] || 0}`);
  pravda('a u každého sedí počet', neshody.length === 0, neshody.slice(0, 5).join('; '));

  /* A robot ta čísla musí taky opravdu zveřejnit.
     Tohle je ta tichá půlka téže chyby. Generátor do index.html čísla
     dopisuje (poslední krok, řádek s writeFileSync), jenže úloha
     update-data.yml zařazovala do commitu ručně psaný seznam souborů —
     a index.html v něm nebyl. Robot tedy čtyřikrát denně čísla přepočítal
     a tu změnu zahodil: v repozitáři leželo 1 954, z dat vycházelo 1 958.
     Úvodní stránka se takhle sama vracela k zastaralému číslu, i když
     kontrola výš byla zelená v okamžiku, kdy ji spustil člověk. */
  const gen = readFileSync(new URL('../scripts/generate-region-pages.mjs', import.meta.url), 'utf8');
  const uloha = readFileSync(new URL('../.github/workflows/update-data.yml', import.meta.url), 'utf8');
  const pisemeUvod = /writeFileSync\(\s*idx\b/.test(gen);
  pravda('generátor dopisuje čísla do index.html', pisemeUvod,
    'kdyby přestal, je kontrola výš bezpředmětná');
  if (pisemeUvod) {
    const pridani = [...uloha.matchAll(/^\s*git add (.+)$/gm)].map((m) => m[1].trim());
    const berevse = pridani.some((r) => /^-A\s*$/.test(r));
    const jmenujeUvod = pridani.some((r) => /\bindex\.html\b/.test(r));
    pravda('a robot index.html opravdu commitne', berevse || jmenujeUvod,
      `v update-data.yml se zařazuje: ${pridani.join(' | ') || '(nic)'} — index.html mezi tím není, takže se přepočet zahodí`);
  }
}

/* --- Co stránky slibují, to musí platit -------------------------------
   Skoro sto stránek webu slibuje „prodeje, dražby i exekuce z celé ČR na
   jedné mapě". Ten slib nedrží kód, ale data: až robotovi vyschne jeden
   ze zdrojů, začne tentýž den lhát celý web najednou a nikdo si toho
   nevšimne, protože se nic nerozbije — jen jeden druh nabídek zmizí.

   Druhá půlka: nabídka v exekuci posílala „kde si to ověřím" do
   insolvenčního rejstříku. Jenže insolvence je úpadek dlužníka, kdežto
   exekuce je vymáhání jednoho dluhu — v rejstříku úpadků se exekuce na
   pozemku nenajde. Vlastní rádce to má správně: ukáže ji list vlastnictví.
   Teď se tedy míří do katastru a tenhle test hlídá, ať se to nevrátí. */
{
  const druhy = {};
  for (const o of nabidky) druhy[o.type] = (druhy[o.type] || 0) + 1;

  const stranky = readdirSync(new URL('..', import.meta.url))
    .filter((f) => f.endsWith('.html'))
    .filter((f) => /dražby (i|a) exekuce/.test(readFileSync(new URL('../' + f, import.meta.url), 'utf8')));
  pravda('slib „prodeje, dražby i exekuce" na stránkách opravdu je',
    stranky.length >= 10, `našel jsem ho jen na ${stranky.length} stránkách`);

  for (const [typ, popis] of [['sale', 'prodeje'], ['drazba', 'dražby'], ['exekuce', 'exekuce']]) {
    pravda(`a data ${popis} opravdu obsahují`, (druhy[typ] || 0) > 0,
      `${stranky.length} stránek slibuje ${popis}, ale v datech není ani jedna nabídka typu „${typ}"`);
  }

  /* A obecně: co věta slibuje „na mapě", to na mapě musí být.
     Chytlo to rádce o obecních pozemcích. Sliboval „prodeje, dražby,
     exekuce i obecní pozemky z celé ČR na jednom místě" — jenže obecní
     záměr v datech nebyl nikdy ani jeden. Kdo si ten rádce přečetl,
     klikl na mapu a zapnul filtr „Obecní záměr", dostal prázdno.
     Připravená kategorie není totéž co kategorie, kterou máme. */
  const KATEGORIE = [
    ['sale', /\bprodeje?\b/i, 'prodeje'],
    ['drazba', /\bdražby\b/i, 'dražby'],
    ['exekuce', /\bexekuce(mi)?\b/i, 'exekuce'],
    ['obec', /\bobecní(mi)?\s+(záměry|pozemky)\b/i, 'obecní záměry'],
  ];
  const lzi = [];
  for (const f of readdirSync(new URL('..', import.meta.url)).filter((x) => x.endsWith('.html'))) {
    const text = readFileSync(new URL('../' + f, import.meta.url), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    /* Jen věty, které o mapě opravdu mluví — ne každá zmínka o dražbě. */
    for (const veta of text.split(/[.!?]/)) {
      if (!/na (naší |jedné )?map|na jednom míst/i.test(veta)) continue;
      for (const [typ, re, popis] of KATEGORIE) {
        if (re.test(veta) && !(druhy[typ] > 0)) lzi.push(`${f}: slibuje ${popis}, v datech 0`);
      }
    }
  }
  pravda('a žádná stránka neslibuje na mapě druh, který v datech není',
    lzi.length === 0, [...new Set(lzi)].slice(0, 5).join('; '));

  /* „Robot je prochází každých 6 hodin (4× za den)" — to číslo je v úvodu
     napsané dvakrát a nikde nevzniká z plánu robota, takže po změně plánu
     by tiše lhalo. Bere se tedy z cronu a porovná se s textem. */
  const uvod = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const plan = readFileSync(new URL('../.github/workflows/update-data.yml', import.meta.url), 'utf8');
  const kazdych = (plan.match(/cron:\s*'0 \*\/(\d+) \* \* \*'/) || [])[1];
  pravda('plán robota se dá přečíst', !!kazdych, 'v update-data.yml není cron tvaru 0 */N * * *');
  if (kazdych) {
    const zaDen = 24 / Number(kazdych);
    pravda(`úvod říká pravdu o tom, jak často robot běží (každých ${kazdych} h, ${zaDen}× denně)`,
      uvod.includes(`každých ${kazdych} hodin`) && uvod.includes(`${zaDen}× za den`) && uvod.includes(`${zaDen}× denně`),
      `podle cronu běží každých ${kazdych} h, tedy ${zaDen}× denně — a to musí sedět i v textu úvodní stránky`);
  }

  /* Komentáře pryč, ať test nechytá vlastní vysvětlení místo kódu. */
  const bezKomentaru = (k) => k.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const soubor of ['js/main.js', 'js/pozemek.js']) {
    const kod = bezKomentaru(readFileSync(new URL('../' + soubor, import.meta.url), 'utf8'));
    pravda(`${soubor} neposílá exekuci do insolvenčního rejstříku`,
      !/isir\.justice\.cz/.test(kod), 'exekuce a insolvence jsou dvě různá řízení');
  }
}

console.log('\nIntegrita datového souboru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
console.log('::error::Data: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
