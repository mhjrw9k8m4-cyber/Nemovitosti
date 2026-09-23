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
const podle = {};
for (const d of DATA) {
  // Jen běžné nabídky k prodeji — stejně jako generátor i js/ceny.js.
  if (d.type !== 'sale') continue;
  if (!(d.price > 0 && d.area >= 100 && d.area <= 500000)) continue;
  const g = dg(d.druh); if (g === 'Ostatní') continue;
  const pm = d.price / d.area;
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
  const dlazdice = [...stranka.matchAll(/<b>([\d\s\u00a0]+) Kč\/m²<\/b><span>([^·]+)·/g)]
    .map((m) => ({ med: +String(m[1]).replace(/\s|\u00a0/g, ''), druh: m[2].trim() }));
  pravda('na stránce jsou vypsané mediány podle druhu', dlazdice.length >= 3,
    'našel jsem jen ' + dlazdice.length);
  const nazev = { 'Zemědělská půda': 'Zemědělská půda', 'Lesní pozemek': 'Lesní pozemek',
    Zahrada: 'Zahrada', 'Stavební': 'Stavební' };
  for (const d of dlazdice) {
    const klic = Object.keys(nazev).find((k) => nazev[k] === d.druh);
    if (!klic) continue;
    const vzorek = (podle[klic] || []).filter((x) => x >= dolniMez(podle[klic] || []));
    if (vzorek.length < 30) continue;
    const spocteno = Math.round(med(vzorek));
    pravda(`„${d.druh}": vytištěný medián sedí s přepočtem z dat (${d.med} Kč/m²)`,
      Math.abs(spocteno - d.med) <= 1,
      `na stránce ${d.med} Kč/m², z dat vychází ${spocteno} Kč/m² — stránka a odhad počítají každý z jiného vzorku`);
  }
}

// --- 3) Výsledek na stránce je věrohodný -----------------------------
const nejlevnejsi = [...stranka.matchAll(/Nejlevnější zemědělská půda[\s\S]{0,600}?<\/div>/g)][0];
const cisla = nejlevnejsi ? [...nejlevnejsi[0].matchAll(/<b>([\d\s\u00a0]+) Kč\/m²<\/b>/g)]
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
const nar0 = stranka.match(/Zemědělská půda · ([\d\s\u00a0]+)–([\d\s\u00a0]+) Kč\/m² · ([\d\s\u00a0]+) nabídek/);
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
pravda('i to, že hranice není odhadem od stolu', /mezer[au] v samotném rozdělení/.test(stranka));

console.log('\nStatistika cen — čísla musí odpovídat skutečnosti');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Statistika cen: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
