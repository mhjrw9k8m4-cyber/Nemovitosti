// Test: čísla na stránce „Ceny pozemků" musí odpovídat skutečnosti.
//
// Spuštění: node scripts/test-statistika.mjs
//
// Web tvrdil, že nejlevnější zemědělská půda je ve Znojmě za 8 Kč/m²
// a v České Lípě taky za 8. Za tolik se u nás pole neprodává. Byly to
// spoluvlastnické podíly (v inzerátu je výměra celé parcely, ale prodává se
// jen zlomek) a špatně načtené ceny. V okrese s devatenácti nabídkami jich
// stačí pár a medián strhnou.
//
// Nejde to utnout jedním číslem pro všechno. Změřeno na datech: u zemědělské
// půdy je rozdělení DVOUVRCHOLOVÉ — těsný shluk na 5–10 Kč/m², pak skoro
// prázdno na 12–17 a teprve od 20 výš vlastní trh. U zahrad a stavebních
// pozemků je rozdělení plynulé a levné kusy jsou skutečné; plošný práh by
// tam smazal poctivé nabídky a medián vyhnal nahoru. Co je u pole nesmysl,
// je u zahrady normální cena.
//
// Proto se hledá mezera v samotném rozdělení. Tenhle test hlídá, že se to
// děje, že to dopadá věrohodně, a že se to na stránce přizná.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const gen = readFileSync(new URL('../scripts/generate-region-pages.mjs', import.meta.url), 'utf8');
/* Duplicity pryč, stejně jako je odstraňuje aplikace i generátor. Tenhle
   test je totiž přepočet toho, co je na stránce — a když každá strana
   počítá z jiného vzorku, rozejdou se o pár korun a vypadá to jako chyba
   ve výpočtu, i když jde jen o dva různé seznamy. Přesně tím se lišil
   medián stavebních: 2 771 ze syrových dat proti 2 824 bez duplicit. */
const PKH = createRequire(import.meta.url)('../js/hlidani-logika.js');
const DATA = PKH.bezDuplicit(
  JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities
);
const stranka = readFileSync(new URL('../cena-pozemku.html', import.meta.url), 'utf8');
/* js/ceny.js je prostý skript, ne modul — načteme ho do globálního prostoru
   kvůli MEZ_ROZPTYL, ať tahle kontrola měří touž mezí jako web. */
new Function(readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8'))();
const PK_CENY = globalThis.PK_CENY;

// --- 1) Generátor mezeru hledá, nenastavuje ji od stolu ---------------
pravda('generátor hledá spodní mez v rozdělení', /function dolniMez\(/.test(gen));
pravda('a používá ji při výpočtu mediánů', /perm2 < \(MEZE_DRUHU\[g\]\|\|0\)/.test(gen));
pravda('meze se počítají z celostátních dat, ne z okresu',
  /spoctiMeze\(all\)/.test(gen),
  'v okrese s devatenácti nabídkami se tvar rozdělení najít nedá — a zrovna tam ty podíly nejvíc škodí');
pravda('mez se nehledá v hrstce nabídek', /if\(n<60\) return 0/.test(gen));

// --- 2) Mez padne tam, kde je v datech mezera -------------------------
function dg(s) {
  s = (s || '').toLowerCase();
  if (/stav/.test(s)) return 'Stavební';
  if (/les/.test(s)) return 'Lesní pozemek';
  if (/zahrad/.test(s)) return 'Zahrada';
  if (/orná|orna|louka|travní|travni|pastvin|zeměděl|zemedel|chmel|vinice|sad|ovocn|pole/.test(s)) return 'Zemědělská půda';
  return 'Ostatní';
}
const med = (a) => { a = a.slice().sort((x, y) => x - y); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
function dolniMez(v) {
  const n = v.length;
  if (n < 60) return 0;
  const m = med(v); if (!(m > 0)) return 0;
  const krok = m / 20, konec = m * 0.7;
  const bin = []; for (let a = 0; a < konec; a += krok) bin.push(v.filter((x) => x >= a && x < a + krok).length);
  let maxDosud = 0, podNim = 0;
  for (let i = 0; i < bin.length; i++) {
    if (bin[i] > maxDosud) maxDosud = bin[i];
    podNim += bin[i];
    if (maxDosud >= n * 0.02 && podNim >= n * 0.03 && bin[i] <= maxDosud * 0.12 && (bin[i + 1] ?? 99) <= maxDosud * 0.12) return (i + 2) * krok;
  }
  return 0;
}
/* js/ceny.js se tu spouští, ne jen čte: potřebujeme z něj cenu za metr,
   která zná spoluvlastnický podíl. */
new Function(readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8'))();
const CENY_MODUL = globalThis.PK_CENY;
if (!CENY_MODUL || !CENY_MODUL.zaMetr) {
  console.error('js/ceny.js se nenačetl — kontrola by počítala jinak než web.');
  process.exit(1);
}
const podle = {};
for (const d of DATA) {
  // Jen běžné nabídky k prodeji — stejně jako generátor i js/ceny.js.
  if (d.type !== 'sale') continue;
  if (!(d.price > 0 && d.area >= 100 && d.area <= 500000)) continue;
  const g = dg(d.druh); if (g === 'Ostatní') continue;
  /* CENA ZA METR PŘES SPOLEČNÝ MODUL, ne dělením celou výměrou.
     U spoluvlastnického podílu je v inzerátu výměra celé parcely a cena
     jen za zlomek; generátor i mapa proto počítají přes js/ceny.js.
     Kdyby si tahle kontrola dělila sama, porovnávala by vytištěná čísla
     s jinak spočítanými a mlčela by přesně tam, kde se ty dva výpočty
     rozejdou — tedy u toho, co má hlídat. */
  const pm = CENY_MODUL.zaMetr(d);
  if (pm == null) continue;
  if ((g === 'Zemědělská půda' || g === 'Lesní pozemek') && pm > 500) continue;
  (podle[g] = podle[g] || []).push(pm);
}
const mezZem = dolniMez(podle['Zemědělská půda'] || []);
pravda('u zemědělské půdy se mezera opravdu najde', mezZem > 0,
  'shluk podílů na 5–10 Kč/m² by zůstal v mediánu');
pravda('a leží tam, kde je rozdělení prázdné', mezZem >= 12 && mezZem <= 22,
  `mez vyšla na ${mezZem.toFixed(1)} Kč/m²`);
/* A hlavně: ostatní druhy se tím nesmí osekat. Nestačí doufat, že u nich
   heuristika mezeru nenajde — najde. V datech z 22. 9. 2026 by u zahrad
   uřízla 37 z 86 nabídek a medián zahrady by vyskočil o polovinu. Ořez se
   proto vůbec nehledá jinde než u zemědělské půdy a lesa, kde je shluk za
   pár korun spolehlivě spoluvlastnický podíl. */
pravda('ořez se hledá jen u zemědělské půdy a lesa',
  /SE_ZKOUMA\s*=\s*\['Zemědělská půda',\s*'Lesní pozemek'\]/.test(gen),
  'u zahrad a stavebních pozemků je levná cena normální cena — tam se osekávat nesmí');
for (const g of ['Zahrada', 'Stavební']) {
  const v = podle[g] || [];
  if (v.length < 60) continue;
  const pad = v.filter((x) => x < dolniMez(v)).length;
  if (pad > 0) {
    zpravy.push(`  · pozn.: u druhu „${g}" by heuristika uřízla ${pad} z ${v.length} — proto se tam nepouští`);
  }
}

/* --- Obě strany webu počítají z téhož ------------------------------
   Stránka cen počítala medián ze VŠECH nabídek, kdežto odhad u konkrétního
   pozemku (js/ceny.js) dražby odjakživa vynechává — vyvolávací cena je pod
   trhem z podstaty věci. Web tak o téže věci tvrdil dvě různá čísla: u
   zahrady 140 Kč/m² na stránce cen a 110 Kč/m² v odhadu, u ostatní plochy
   se to rozcházelo o 41 %. Čísla musí vycházet ze stejného vzorku, jinak
   si web protiřečí a nikdo nepozná, které z nich platí. */
pravda('stránka cen počítá jen z běžných nabídek k prodeji',
  /function jeBeznaNabidka\(o\)\{ return o\.type === 'sale'; \}/.test(gen),
  'do mediánu by se počítaly i vyvolávací ceny dražeb');
{
  const ceny = readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8');
  pravda('a odhad u pozemku taky', /if \(d\.type !== 'sale'\) return;/.test(ceny),
    'js/ceny.js by srovnával dražby samy se sebou');
}
// A hlavně čísla: co je vytištěné na stránce, musí sedět s přepočtem z dat.
{
  /* Řádek seznamu „ceny podle druhu": číslo a název čteme z jedné položky,
     ne dvěma nezávislými hledáními — jinak by se při změně pořadí spárovalo
     číslo jednoho druhu s názvem jiného a test by to odkýval. */
  const dlazdice = [...stranka.matchAll(
    /* „cen-druh" může nést i modifikátor (cen-siroke). Bez toho by řádek
       s varováním z kontroly vypadl a jeho medián by se proti datům
       neověřoval — kontrola by tiše přestala hlídat jeden druh. */
    /* Název druhu je teď odkaz na přehled toho druhu (pozemky-lesni.html
       a spol.), takže vzorek musí snést i tu značku uvnitř. Bez toho
       nenašel nic a kontrola čísel tiše přestala platit. */
    /<li class="cen-druh[^"]*"><b>([\d\s\u00a0]+)[\s\u00a0]Kč\/m²<\/b><span class="cen-nazev">(?:<a [^>]*>)?([^<]+)(?:<\/a>)?<\/span>/g)]
    .map((m) => ({ med: +String(m[1]).replace(/\s|\u00a0/g, ''), druh: m[2].trim() }));
  pravda('na stránce jsou vypsané mediány podle druhu', dlazdice.length >= 3,
    'našel jsem jen ' + dlazdice.length);
  /* Klíč v datech → název na stránce. „Stavební" se lidem píše jako
     „Stavební pozemek", ať to není jediný přídavný jméno mezi podstatnými. */
  const nazev = { 'Zemědělská půda': 'Zemědělská půda', 'Lesní pozemek': 'Lesní pozemek',
    Zahrada: 'Zahrada', 'Stavební': 'Stavební pozemek' };
  for (const d of dlazdice) {
    const klic = Object.keys(nazev).find((k) => nazev[k] === d.druh);
    if (!klic) continue;
    /* Ořez SE POČÍTÁ JEN TAM, KDE HO POČÍTÁ I GENERÁTOR. Ten ho hledá
       výhradně u zemědělské půdy a lesa (SE_ZKOUMA), protože jinde je
       levná cena normální cena — hlídá to kontrola o kus výš. Kontrola
       čísel ho ale aplikovala na VŠECHNY druhy, takže u zahrad porovnávala
       stránku s jinak spočítaným číslem než tím, co stránka tiskne.
       Dlouho to procházelo, protože ořez u zahrad nic neuřízl; jakmile se
       data rozevřela (čtvrtiny 45 a 991 Kč/m²), uřízl levnou polovinu a
       medián vyskočil ze 134 na 783 Kč/m². Padala zkouška, ne web. */
    const SE_OREZAVA = ['Zemědělská půda', 'Lesní pozemek'];
    const cely = podle[klic] || [];
    const vzorek = SE_OREZAVA.indexOf(klic) === -1 ? cely : cely.filter((x) => x >= dolniMez(cely));
    if (vzorek.length < 30) continue;
    const spocteno = Math.round(med(vzorek));
    pravda(`„${d.druh}": vytištěný medián sedí s přepočtem z dat (${d.med} Kč/m²)`,
      Math.abs(spocteno - d.med) <= 1,
      `na stránce ${d.med} Kč/m², z dat vychází ${spocteno} Kč/m² — stránka a odhad počítají každý z jiného vzorku`);
  }
}

// --- 3) Výsledek na stránce je věrohodný -----------------------------
const nejlevnejsi = [...stranka.matchAll(/Nejlevnější zemědělská půda[\s\S]{0,600}?<\/div>/g)][0];
const cisla = nejlevnejsi ? [...nejlevnejsi[0].matchAll(/<b>([\d\s\u00a0]+)[\s\u00a0]Kč\/m²<\/b>/g)]
  .map((m) => +String(m[1]).replace(/\s|\u00a0/g, '')) : [];
pravda('na stránce jsou nejlevnější okresy vypsané', cisla.length >= 2, JSON.stringify(cisla));
/* Tohle je to jádro. Zemědělská půda se v Česku obchoduje řádově za
   desítky korun za metr; jednotky korun znamenají podíl, ne levné pole. */
pravda('žádný okres nehlásí cenu pole pod 15 Kč/m²',
  cisla.every((x) => x >= 15),
  `nejnižší vypsaná hodnota je ${Math.min(...cisla)} Kč/m² — za tolik se pole neprodává`);
// Čísla se vypisují s mezerou po tisících („1 273"), ne holá — jinak by
// vedle „2 849 Kč/m²" stálo „1273" a vypadalo to jako dva různé weby.
const cislo = (x) => +String(x).replace(/\s|\u00a0/g, '');
/* Varování „ceny se liší násobky" musí sedět na těch druzích, kde se
   čtvrtiny opravdu rozestoupí — a jen na nich. Mez se bere z js/ceny.js,
   takže tahle kontrola zároveň hlídá, že si stránka nezavádí vlastní. */
{
  const mez = (PK_CENY && PK_CENY.MEZ_ROZPTYL) || 2;
  /* Název druhu je odkaz na přehled toho druhu, takže vzorek musí snést
     i tu značku uvnitř — stejně jako vzorek o kus výš. */
  const RADEK = /<li class="cen-druh( cen-siroke)?"><b>([\d\s]+)[\s\u00a0]Kč\/m²<\/b><span class="cen-nazev">(?:<a [^>]*>)?([^<]+)(?:<\/a>)?<\/span><span class="cen-detail">obvykle ([\d\s]+)–([\d\s]+)/g;
  const radky = [...stranka.matchAll(RADEK)];
  pravda('řádky s cenami se daly přečíst', radky.length >= 3, `přečteno ${radky.length}`);
  const c = (x) => +String(x).replace(/\s/g, '');
  const spatne = [];
  for (const m of radky) {
    const oznaceno = !!m[1], med = c(m[2]), druh = m[3], lo = c(m[4]), hi = c(m[5]);
    const rozptyl = med ? (hi - lo) / med : 0;
    if (rozptyl > mez && !oznaceno) spatne.push(`${druh}: rozptyl ${rozptyl.toFixed(1)}× a bez varování`);
    if (rozptyl <= mez && oznaceno) spatne.push(`${druh}: rozptyl jen ${rozptyl.toFixed(1)}×, varování tam nepatří`);
  }
  pravda('a varování „liší se násobky" sedí na správných druzích', spatne.length === 0,
    spatne.join('; '));
}

const nar0 = stranka.match(
  /* Mezery ve vysázeném textu můžou být nezlomitelné (scripts/sazba.mjs),
   tak ať je vzor snese obě — jinak kontrola tiše přestane cokoli najít. */
  /Zemědělská půda(?:<\/a>)?<\/span><span class="cen-detail">obvykle ([\d\s\u00a0]+)–([\d\s\u00a0]+)[\s\u00a0]Kč\/m²[\s\u00a0]·[\s\u00a0]z[\s\u00a0]([\d\s\u00a0]+)[\s\u00a0]nabídek/);
const nar = nar0 ? [nar0[0], cislo(nar0[1]), cislo(nar0[2]), cislo(nar0[3])] : null;
pravda('celostátní rozpětí je vypsané', !!nar, 'nenalezeno');
if (nar) {
  pravda('a je v rozumných mezích', +nar[1] >= 20 && +nar[2] <= 150,
    `rozpětí ${nar[1]}–${nar[2]} Kč/m²`);
  pravda('počítá se z dost nabídek', +nar[3] >= 300, `jen ${nar[3]}`);
}

// --- 4) Stránka se k tomu přizná -------------------------------------
pravda('stránka říká, že se něco nezapočítává', /nezapočítáváme/.test(stranka),
  'vyřazovat nabídky a neříct to je horší než je nevyřazovat');
pravda('a vysvětluje proč', /spoluvlastnick/.test(stranka));
pravda('i to, že hranice není odhadem od stolu', /mezer[au][\s\u00a0]v[\s\u00a0]samotném rozdělení/.test(stranka));

// --- 5) Medián z hrstky nabídek se nesmí tvářit jako změřená cena ----
/* Na okresní stránce stálo „Medián ceny (stavební): 17 467 Kč/m²
   (orientačně, z 12 nabídek)". Slovo „orientačně" nese celou výhradu
   a přečte ho málokdo — číslo je tučné, velké a vypadá jako změřená
   cena okresu. Přitom u dvanácti nabídek posune výsledek jedna drahá
   parcela o desítky procent.
   Kontrola projde všechny okresní a krajské stránky a u každé, která
   medián vypisuje z malého vzorku, vyžaduje, aby to bylo napsané
   rovnou — a aby u čísla stálo rozpětí, ne jen prostředek. */
{
  const { readdirSync } = createRequire(import.meta.url)('node:fs');
  const KOREN = new URL('..', import.meta.url);
  /* Mez se čte TAM, KDE JE DEFINOVANÁ — v js/ceny.js. Dřív se vybírala
     regulárním výrazem ze zdroje generátoru, a když se přestěhovala do
     společného modulu (aby ji stejně znal i graf v prohlížeči), kontrola
     ji přestala najít a hlásila „chybí". Číst hodnotu z toho jediného
     místa je i jediný způsob, jak se nemůže rozejít s tím, co se počítá. */
  const CENY_M = createRequire(import.meta.url)(new URL('js/ceny.js', KOREN).pathname);
  const DOST = Number((CENY_M && CENY_M.DOST_NABIDEK) || globalThis.PK_CENY.DOST_NABIDEK || 0);
  pravda('mez „kolik nabídek už je dost" je v js/ceny.js (jedno místo pro web i graf)',
    DOST >= 15, `DOST_NABIDEK = ${DOST || 'chybí'}`);
  /* A že si ji generátor neopisuje po svém: dvě dvacetpětky se rozejdou
     a na stránce by pak stálo číslo s výhradou a nad ním graf bez ní. */
  pravda('a generátor stránek okresů si ji neopisuje',
    /const DOST_NABIDEK = CENY\.DOST_NABIDEK;/.test(gen) && !/const DOST_NABIDEK = \d/.test(gen),
    'generate-region-pages.mjs má mez napsanou vlastním číslem');
  /* Totéž pro graf: ten běží v prohlížeči bez js/ceny.js, tak mu mez
     cestuje v souboru s historií. Opsané číslo v grafu by byla třetí kopie. */
  const grafZdroj = readFileSync(new URL('js/graf-cen.js', KOREN), 'utf8');
  pravda('a graf ji bere ze souboru s historií, ne z vlastního čísla',
    /H\.dost/.test(grafZdroj) && !/vzorek\s*[<>]=?\s*\d\d/.test(grafZdroj),
    'js/graf-cen.js si mez nese sám');
  const historie = JSON.parse(readFileSync(new URL('data/historie-cen.json', KOREN), 'utf8'));
  pravda('a v tom souboru ta mez opravdu je, a je to tatáž',
    historie.dost === DOST, `v souboru ${historie.dost}, v js/ceny.js ${DOST}`);

  const soubory = readdirSync(KOREN).filter((f) => /^pozemky-(okres-|[a-z]+-kraj)/.test(f));
  const bezVyhrady = [], bezRozpeti = [];
  for (const f of soubory) {
    const h = readFileSync(new URL(f, KOREN), 'utf8');
    const m = /Medián ceny \(([^)]*)\):([\s\S]{0,420}?)<\/p>/.exec(h);
    if (!m) continue;
    const blok = m[2];
    const n = Number(((/z (\d[\d\s\u00a0]*) nab/.exec(blok) || [])[1] || '').replace(/[\s\u00a0]/g, ''));
    if (!isFinite(n) || !n) continue;
    if (!/obvykle/.test(blok)) bezRozpeti.push(`${f} (${n})`);
    if (n < DOST && !/hrubé vodítko|je to málo/.test(blok)) bezVyhrady.push(`${f} (z ${n} nabídek)`);
  }
  pravda('u mediánu stojí i rozpětí, ne jen prostředek', bezRozpeti.length === 0,
    bezRozpeti.slice(0, 4).join(', '));
  pravda('a u malého vzorku je rovnou napsané, že je to jen vodítko',
    bezVyhrady.length === 0,
    bezVyhrady.slice(0, 4).join(', ') + (bezVyhrady.length > 4 ? ` … a dalších ${bezVyhrady.length - 4}` : ''));
  /* Kontrola samotné kontroly: kdyby se na stránkách žádný medián
     nenašel, obě kontroly výš by prošly a nehlídaly by nic. */
  const kolik = soubory.filter((f) => /Medián ceny/.test(readFileSync(new URL(f, KOREN), 'utf8'))).length;
  pravda('a medián se opravdu na stránkách vyskytuje', kolik >= 20, `našel jsem ho na ${kolik} stránkách`);
}

console.log('\nStatistika cen — čísla musí odpovídat skutečnosti');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Statistika cen: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
