// Test: stránky „Pozemky do X Kč" musí vypisovat to, co tvrdí.
//
// Spuštění: node scripts/test-rozpocet-stranky.mjs
//
// Stránka s nadpisem „Pozemky do 500 000 Kč" je slib, a je to slib,
// který se dá rozbít tiše. Stačí, aby řez dat vznikl z jiného seznamu
// než výpis pod ním, a mezi nabídkami do půl milionu stojí pozemek za
// dva — nikdo si toho nevšimne, protože čísla v hlavičce pořád sedí.
// Proto se tady VŠECHNO přepočítá znovu z data/opportunities.json
// a porovná s tím, co je v HTML. Ne tak, jak to spočítal generátor,
// ale tak, jak by to spočítal člověk, který mu nevěří.
//
// Hlídá se i to, proč ty stránky vznikly: věta o tom, kolik z nabídek
// v dané ceně jsou opravdu STAVEBNÍ pozemky. Kdo si myslí, že si za
// půl milionu koupí parcelu na dům, má to vědět z první obrazovky —
// a to číslo musí být pravdivé, jinak je ta stránka past.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const require_ = createRequire(import.meta.url);
const U = (p) => new URL('../' + p, import.meta.url);
/* js/terminy.js a js/ceny.js jsou prosté skripty, ne moduly — do
   globálního prostoru, ať se měří touž mezí jako web. */
new Function(readFileSync(U('js/terminy.js'), 'utf8'))();
new Function(readFileSync(U('js/ceny.js'), 'utf8'))();
const T = globalThis.PK_TERMINY, CENY = globalThis.PK_CENY;
const PKH = require_('../js/hlidani-logika.js');
const all = PKH.bezDuplicit(JSON.parse(readFileSync(U('data/opportunities.json'), 'utf8')).opportunities);
const MODEL = CENY.postav(all);

/* ŘEZ DAT, NAPSANÝ ZNOVU. Záměrně se tu nevolá nic z generátoru ani
   z generate-rozpocet.mjs: kdyby test bral řez odtamtud, ověřoval by
   jen to, že generátor je sám se sebou v souladu. */
const rez = all
  .filter((o) => !T.poTerminu(o))
  .filter((o) => o.type === 'sale' && !o.podil && o.price > 0 && o.area > 0)
  .filter((o) => !(MODEL.neduveryhodna && MODEL.neduveryhodna(o)))
  .filter((o) => !(MODEL.odhad(o) || {}).pochybna);

const STROPY = [
  { strop: 200000, soubor: 'pozemky-do-200-tisic.html', popis: '200 000' },
  { strop: 500000, soubor: 'pozemky-do-500-tisic.html', popis: '500 000' },
  { strop: 1000000, soubor: 'pozemky-do-1-milionu.html', popis: '1 000 000' },
  { strop: 2000000, soubor: 'pozemky-do-2-milionu.html', popis: '2 000 000' },
];
/* Po sestavení jsou v číslech pevné mezery (scripts/sazba.mjs) —
   porovnává se tedy až po jejich odstranění. */
const cislo = (s) => Number(String(s).replace(/[\s ]/g, ''));
const mezery = (s) => String(s).replace(/[\s ]+/g, ' ');
function median(a) {
  if (!a.length) return 0;
  const b = a.slice().sort((x, y) => x - y);
  const n = b.length;
  return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
}

pravda('řez dat není prázdný', rez.length > 100, `v řezu je ${rez.length} nabídek`);

let videnoStranek = 0, videnoRadku = 0, videnoStavebnich = 0;
const pocty = [];

for (const s of STROPY) {
  const cesta = U(s.soubor);
  if (!existsSync(cesta)) {
    pravda(`${s.soubor} existuje`, false, 'stránku generuje scripts/generate-region-pages.mjs — spusťte node scripts/oprav.mjs');
    continue;
  }
  videnoStranek++;
  /* PEVNÉ MEZERY PRYČ UŽ TADY. scripts/sazba.mjs je při sestavení sází
     do čísel i mezi číslo a jednotku, takže „z 349" je v hotovém HTML
     „z\u00a0349" — hledání s obyčejnou mezerou by tiše nic nenašlo
     a test by hlásil „na stránce undefined" místo skutečného rozporu.
     (Přesně tím tenhle test poprvé spadl.) */
  const h = readFileSync(cesta, 'utf8').replace(/\u00a0/g, ' ');
  const moje = rez.filter((o) => o.price <= s.strop).sort((a, b) => a.price - b.price);
  pocty.push(moje.length);
  const okresy = new Set(moje.map((o) => o.okres).filter(Boolean));

  // --- 1) Hlavička: nadpis a čísla v podtitulku --------------------
  pravda(`${s.soubor}: nadpis uvádí strop`,
    new RegExp('<h1>Pozemky do ' + s.popis.replace(/ /g, '\\s') + '\\sKč').test(h),
    'nadpis: ' + mezery((/<h1>([^<]*)<\/h1>/.exec(h) || [])[1] || '—'));
  const sub = (/<p class="sub">([\s\S]*?)<\/p>/.exec(h) || [])[1] || '';
  const subPocet = cislo((/<b>([\d\s ]+) pozem/.exec(mezery(sub)) || [])[1] || '-1');
  pravda(`${s.soubor}: počet v podtitulku = ${moje.length}`, subPocet === moje.length,
    `na stránce ${subPocet}, přepočítáno ${moje.length}`);
  const subOkresu = cislo((/<b>([\d\s ]+) okres/.exec(mezery(sub)) || [])[1] || '-1');
  pravda(`${s.soubor}: počet okresů v podtitulku = ${okresy.size}`, subOkresu === okresy.size,
    `na stránce ${subOkresu}, přepočítáno ${okresy.size}`);

  // --- 2) Dlaždice: mediánová výměra ------------------------------
  const medVym = Math.round(median(moje.map((o) => o.area)));
  pravda(`${s.soubor}: mediánová výměra = ${medVym} m²`,
    new RegExp('<b>' + String(medVym).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s') + '\\sm²</b><span>mediánová výměra').test(h),
    'v dlaždici: ' + mezery((/<b>([^<]*)<\/b><span>mediánová výměra/.exec(h) || [])[1] || '—'));
  const medZaM = Math.round(median(moje.map((o) => o.price / o.area)));
  pravda(`${s.soubor}: prostřední cena za metr = ${medZaM} Kč/m²`,
    new RegExp('<b>' + String(medZaM).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s') + '\\sKč/m²</b>').test(h),
    'na stránce: ' + mezery((/metr v tomhle rozpočtu je <b>([^<]*)<\/b>/.exec(h) || [])[1] || '—'));

  // --- 3) VÝPIS: nic dražšího, než co je v nadpisu -----------------
  const ceny = [...h.matchAll(/class="okr-cena"><b>([\d\s ]+)[\s ]Kč<\/b>/g)].map((m) => cislo(m[1]));
  videnoRadku += ceny.length;
  pravda(`${s.soubor}: výpis má řádky`, ceny.length > 0, 'nenašel jsem ani jednu cenu ve výpisu');
  pravda(`${s.soubor}: vypsáno ${Math.min(moje.length, 40)} nabídek`,
    ceny.length === Math.min(moje.length, 40),
    `na stránce ${ceny.length} řádků, čekáno ${Math.min(moje.length, 40)}`);
  const nadStrop = ceny.filter((c) => c > s.strop);
  pravda(`${s.soubor}: ŽÁDNÁ vypsaná cena nepřekračuje ${s.popis} Kč`, nadStrop.length === 0,
    nadStrop.length ? `přes strop: ${nadStrop.slice(0, 5).join(', ')} Kč` : '');
  pravda(`${s.soubor}: výpis je od nejnižší ceny`,
    ceny.every((c, i) => i === 0 || ceny[i - 1] <= c),
    'první neseřazený: ' + (ceny.findIndex((c, i) => i > 0 && ceny[i - 1] > c)));
  pravda(`${s.soubor}: nejlevnější na stránce je nejlevnější v řezu (${moje[0].price} Kč)`,
    ceny[0] === moje[0].price, `na stránce ${ceny[0]}, v řezu ${moje[0].price}`);

  // --- 4) Co ve výpisu NESMÍ být ----------------------------------
  pravda(`${s.soubor}: ve výpisu není dražba ani exekuce`,
    !/okr-badge t-(drazba|exekuce)/.test(h),
    'dražba má vyvolávací cenu, ne cenu — s rozpočtem se neporovnává');
  pravda(`${s.soubor}: ve výpisu není spoluvlastnický podíl`,
    !/<b>spoluvlastnický podíl/.test(h),
    'u podílu je výměra celé parcely, ale cena jen za zlomek');

  // --- 5) VĚTA O STAVEBNÍCH POZEMCÍCH -----------------------------
  const stavebnich = moje.filter((o) => CENY.druhGroup(o.druh) === 'Stavební / zastavěná').length;
  if (stavebnich === 0) {
    videnoStavebnich++;
    pravda(`${s.soubor}: přiznává, že stavební pozemek v nabídce není`,
      new RegExp('v nabídce není ani jeden</b> z ' + String(moje.length).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s')).test(h),
      'věta: ' + mezery((/<p class="rules-note"[^>]*>(Stavebn[\s\S]{0,120})/.exec(h) || [])[1] || '—'));
  } else {
    videnoStavebnich++;
    const veta = mezery((/Stavebních pozemků [^<]*<b>([\d\s ]+)<\/b> z ([\d\s ]+)/.exec(h) || [])[0] || '');
    const m = /<b>([\d ]+)<\/b> z ([\d ]+)/.exec(veta) || [];
    pravda(`${s.soubor}: počet stavebních ve větě = ${stavebnich}`, cislo(m[1] || '-1') === stavebnich,
      `na stránce ${m[1]}, přepočítáno ${stavebnich} (věta: ${veta || '—'})`);
    pravda(`${s.soubor}: věta o stavebních se vztahuje k celku ${moje.length}`,
      cislo(m[2] || '-1') === moje.length, `na stránce „z ${m[2]}", přepočítáno ${moje.length}`);
  }

  // --- 6) Rozpad podle druhu musí dát dohromady celek -------------
  const sekceDruhu = (/<h2>Co se za [^<]*<\/h2>[\s\S]*?<div class="okr-index-grid">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '';
  const druhCisla = [...sekceDruhu.matchAll(/<span>([\d\s ]+)<\/span>/g)].map((x) => cislo(x[1]));
  pravda(`${s.soubor}: rozpad podle druhu dá dohromady ${moje.length}`,
    druhCisla.length > 0 && druhCisla.reduce((a, b) => a + b, 0) === moje.length,
    `součet ${druhCisla.reduce((a, b) => a + b, 0)} z ${druhCisla.length} druhů, čekáno ${moje.length}`);

  // --- 7) Okresy: počty sedí a odkazy vedou na existující stránky --
  const sekceOkresu = (/<h2>Kde se za [^<]*<\/h2>[\s\S]*?<div class="okr-index-grid">([\s\S]*?)<\/div>/.exec(h) || [])[1] || '';
  const okresOdkazy = [...sekceOkresu.matchAll(/<a href="(pozemky-okres-[^"]+)">([^<]*?)[\s ]*<span>([\d\s ]+)<\/span>/g)];
  pravda(`${s.soubor}: rozcestník okresů má řádky`, okresOdkazy.length > 0);
  let okresSpatne = [], okresMrtve = [];
  for (const [, soubor, nazev, pocet] of okresOdkazy) {
    const jmeno = nazev.replace(/[\s ]+$/, '');
    const skutecne = moje.filter((o) => o.okres === jmeno).length;
    if (skutecne !== cislo(pocet)) okresSpatne.push(`${jmeno}: stránka ${cislo(pocet)}, přepočet ${skutecne}`);
    if (!existsSync(U(soubor))) okresMrtve.push(soubor);
  }
  pravda(`${s.soubor}: počty u okresů sedí (${okresOdkazy.length} odkazů)`, okresSpatne.length === 0,
    okresSpatne.slice(0, 3).join('; '));
  pravda(`${s.soubor}: odkazy na okresy nejsou mrtvé`, okresMrtve.length === 0, okresMrtve.join(', '));
  const sestupne = okresOdkazy.map((x) => cislo(x[3]));
  pravda(`${s.soubor}: okresy jsou od nejvíc nabídek`,
    sestupne.every((c, i) => i === 0 || sestupne[i - 1] >= c), sestupne.join(' '));

  // --- 8) Odkaz na mapu musí nést filtr, který mapa umí -----------
  pravda(`${s.soubor}: odkaz na mapu používá filtr maxc=${s.strop}`,
    h.includes(`index.html?maxc=${s.strop}#mapa`),
    'mapa čte ?q=&druh=&maxc=&mina= (js/main.js, openFromUrl) — jiný název filtru se tiše nenastaví');

  // --- 9) Prolinkování: ostatní rozpočty a nástroj ----------------
  for (const j of STROPY) {
    if (j.soubor === s.soubor || !existsSync(U(j.soubor))) continue;
    pravda(`${s.soubor}: odkazuje na ${j.soubor}`, h.includes(`href="${j.soubor}"`));
  }
  pravda(`${s.soubor}: odkazuje na nástroj pro vlastní částku`,
    h.includes('href="na-co-mam-pozemek.html"'));
  pravda(`${s.soubor}: přiznává, co je z výpisu vynechané`,
    /dražba má vyvolávací cenu/.test(h) && /spoluvlastnický podíl má cenu za zlomek/.test(h),
    'bez téhle věty vypadá řez dat jako celá nabídka webu');
}

pravda('viděl jsem všechny čtyři stránky', videnoStranek === STROPY.length, `viděno ${videnoStranek}`);
pravda('a prošel na nich řádky s cenami', videnoRadku >= 4 * 40, `řádků ${videnoRadku}`);
pravda('věta o stavebních se kontrolovala na každé', videnoStavebnich === videnoStranek,
  `kontrolováno ${videnoStavebnich} z ${videnoStranek}`);
/* Čtyři stránky, které by říkaly totéž, jsou zbytečné — a pro
   vyhledávač je to podezřelé (jedna šablona, čtyři adresy). Počty
   musí s rostoucím stropem růst, jinak se stropy vybraly špatně. */
pravda('stránky se navzájem liší: počet s rostoucím stropem roste',
  pocty.every((c, i) => i === 0 || pocty[i - 1] < c), pocty.join(' → '));

/* NÁSTROJ A STRÁNKY SI NESMÍ ODPOROVAT. „Na co mám?" počítá v prohlížeči
   z data/rozpocet.json, tyhle stránky se generují z opportunities.json.
   Jsou to dvě různé cesty k témuž číslu — a kdyby se jejich řezy
   rozešly, řekne web o téže částce na dvou svých stránkách dvě různá
   čísla. Nejde o to, že by to spadlo: je to tichý rozpor, který by
   člověk našel dřív než my. */
{
  const R = JSON.parse(readFileSync(U('data/rozpocet.json'), 'utf8'));
  pravda('řez nástroje má týž počet nabídek jako přepočet (${rez.length})'
    .replace('${rez.length}', rez.length), R.n.length === rez.length,
    `rozpocet.json ${R.n.length}, přepočítáno ${rez.length}`);
  for (const s of STROPY) {
    const nastroj = R.n.filter((r) => r[2] <= s.strop).length;
    const muj = rez.filter((o) => o.price <= s.strop).length;
    pravda(`do ${s.popis} Kč: nástroj i stránka vidí ${muj} nabídek`, nastroj === muj,
      `rozpocet.json ${nastroj}, přepočítáno ${muj}`);
    const okN = new Set(R.n.filter((r) => r[2] <= s.strop).map((r) => r[0])).size;
    const okM = new Set(rez.filter((o) => o.price <= s.strop).map((o) => o.okres).filter(Boolean)).size;
    pravda(`do ${s.popis} Kč: nástroj i stránka vidí ${okM} okresů`, okN === okM,
      `rozpocet.json ${okN}, přepočítáno ${okM}`);
  }
}

// --- 10) Sitemap a rozcestníky --------------------------------------
const sm = readFileSync(U('sitemap.xml'), 'utf8');
for (const s of STROPY) {
  if (!existsSync(U(s.soubor))) continue;
  pravda(`sitemap.xml zná ${s.soubor}`, sm.includes('/' + s.soubor));
}
const rozc = readFileSync(U('pozemky-podle-okresu.html'), 'utf8');
pravda('rozcestník okresů má oddíl podle rozpočtu', /<h2>Podle rozpočtu<\/h2>/.test(rozc));
const nastroj = readFileSync(U('na-co-mam-pozemek.html'), 'utf8');
for (const s of STROPY) {
  if (!existsSync(U(s.soubor))) continue;
  pravda(`rozcestník okresů odkazuje na ${s.soubor}`, rozc.includes(`href="${s.soubor}"`));
  pravda(`„Na co mám?" odkazuje na ${s.soubor}`, nastroj.includes(`href="${s.soubor}"`));
}

console.log('Stránky podle rozpočtu:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
process.exit(chyb ? 1 : 0);
