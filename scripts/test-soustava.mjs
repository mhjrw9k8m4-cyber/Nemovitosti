/* ZBYLÉ OSY SOUSTAVY: průhlednost, vlasová linka, čas nájezdu.
 *
 * Spuštění: node scripts/test-soustava.mjs   (nepotřebuje prohlížeč)
 *
 * Odstupy, zaoblení, velikosti písma, prostrkání, řádkování a vrstvy
 * mají svou zkoušku. Tyhle tři osy ji neměly a vypadaly takhle:
 *
 * PRŮHLEDNOST — 24 hodnot, a OSM z nich byla TÁŽ hodnota zapsaná dvěma
 *   způsoby: .42 vedle 0.42, .45 vedle 0.45, .5/.6/.7/.75/.8/.85 taky.
 *   To nikdo nepozná ani okem, ani hledáním — a `grep opacity:0.85`
 *   najde tři ze devíti míst. Táž vada, na jakou už test-typografie
 *   hlídá prostrkání („.03em vedle -0.03em se nepozná"); tady jen nikdo
 *   nehlídal. Zápis je proto jeden (s vedoucí nulou) a hodnoty jsou na
 *   dvacetinové mřížce: krok 0,05 je nejmenší rozdíl, který na ploše
 *   ještě jde poznat. Mimo mřížku bylo 0.085, 0.12, 0.14, 0.32, 0.42
 *   a 0.78.
 *
 * VLASOVÁ LINKA — 1px (217×), 1.5px (19×), 2px (13×), 3px (7×) a jedno
 *   1.6px u šipky v nabídce. Šestnáct setin pixelu vedle patnácti nikdo
 *   nerozhodl. Dovolené jsou čtyři šířky, každá má svou práci: 1 linka,
 *   1.5 obrys ovladače, 2 zaměření, 3 barevný pruh na kartě.
 *
 * ČAS NÁJEZDU — tady je potřeba rozlišovat, a je to ten nejdůležitější
 *   komentář v souboru. `transition:` mělo surové trvání na JEDNOM místě
 *   z celého stylopisu; zbylých 29 čísel byly ANIMACE, a tam je rozdíl
 *   skutečný: radar pulsuje 2,6 s, třpyt 1,4 s, tři obláčky na pozadí
 *   mají 14, 18 a 16 s ZÁMĚRNĚ různě, aby se nesesynchronizovaly, a
 *   .reveal má žebřík zpoždění 0.09/0.18/0.27/0.36 s, což je jedna
 *   soustava (0,09 × n), ne čtyři náhody. Tohle se nesjednocuje.
 *
 *   Co se sjednotilo, je rodina NÁJEZDŮ A ODEZEV — „panel se objevil",
 *   „číslo se přepočítalo", „karta odletěla". Jedna práce, a deset
 *   trvání: .12, .14, .2, .26, .3, .34, .42, .45, .5. Těch je teď tolik,
 *   kolik je tokenů: var(--cas-rychly) .12s, var(--cas-zakladni) .2s,
 *   var(--cas-pomaly) .4s.
 *
 *   Zkouška proto hlídá jen `transition` a jmenované nájezdové animace;
 *   seznam animací, které si svůj vlastní čas drží, je tady vypsaný
 *   i s důvodem, aby to nebylo smetiště.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

export const PRUHLEDNOST_KROK = 0.05;
export const LINKY = [1, 1.5, 2, 3];
/* POMĚR STRAN NÁHLEDU. Jeden na celém webu: 16/10. Naměřeno na
   stránce okresu — týž letecký výřez měl na telefonu 290 × 181 px
   (1,60) a na monitoru 128 × 128 (1,00), tedy jiný tvar v jednom
   výpisu než ve druhém. Výjimky jsou vypsané i s důvodem; selektor
   je klíč, aby se poznalo, čeho se výjimka týká. */
export const POMER = '16/10';
/* Výjimka říká I SVOU HODNOTU: jinak by selektor, který výjimku má,
   směl mít poměr jakýkoli. `.pz-media` je přesně ten případ — na
   monitoru má 16/10 a výjimka se týká jen telefonní podoby. */
export const POMER_VYJIMKY = {
  '.map-side .opp-media': { je: 'auto', proc: 'vedle seznamu na úvodní stránce stojí velká mapa, takže mapka u karty je to nejvíc zdvojené, co karta má — 150 px výšky sráží kartu na 362 px, aby se vešla na notebook 1280×700' },
  '.photo-preview .pp img': { je: '1/1', proc: 'miniatura NAHRANÉHO SOUBORU ve formuláři, ne náhled nabídky — čtverečky v řádku se porovnávají mezi sebou' },
  '.pz-media': { je: '4/3', proc: 'hero na stránce pozemku jde na telefonu od kraje ke kraji a 4/3 je tam výška, kterou snímek unese' },
};

/* PŘELIV NA PLOŠE MUSÍ MÍT DŮVOD. Ze 57 přelivů ve stylopisu jich 19
   jen zdobilo plochu (karty, úvodní plocha „Přidat pozemek", pás
   s počítadly, spojnice kroků, pruh síly hesla) — a většina z nich
   nebyla ani vidět: přelévala bílou do bílé (#FFFFFF → #F7F8F8).
   Zbytek práci dělá, a tady je vypsaný i s tou prací. Masky
   (mask-image) se nevypisují: maska není plocha, je to tvar.
   Měří se `background` a `background-image`; klíč je selektor tak, jak
   stojí ve stylopisu. */
export const PRELIVY = {
  '.mcf-akce': 'maska na kraji vodorovného pásu akcí — říká, že je kam rolovat',
  '.sk': 'kostra načítání: přejezd třpytu, který říká „ještě se to nese"',
  '.opp-media': 'podklad náhledu, než se snímek stáhne — a vrstva pod závojem',
  '.opp-mgrad': 'závoj nad snímkem: bez něj není bílé písmo na fotce čitelné',
  '.sn-popis': 'týž závoj pod popiskou na snímku pozemku',
  '.okr-item .okr-foto': 'mříž v zástupném snímku — opakovaná 1px linka, tedy vzor, ne přeliv barev',
  '.s-mrizka::before': 'mříž na pozadí sekce, stejný vzor z 1px linek',
  '.add-hero::after, .section.band::after': 'mříž na pásu a nad úvodní plochou',
  'footer::after': 'mříž v patičce — opakovaná 1px linka, tedy vzor, ne přeliv barev',
  '.okr-band::before': 'mříž na pásu stránky okresu',
  '.uvod-hrdina::before': 'mříž na úvodní desce — opakovaná 1px linka, tedy vzor, ne přeliv barev; dole ji maska vytrácí, aby nerušila text',
  '.add-hero:not(.app-hero)::before': 'mříž nad úvodní plochou „Přidat pozemek"',
  '.vm-mapa-obal::after': 'stín při spodním kraji mapy ve výběru místa — říká, že mapa pokračuje pod ovládáním',
  '.por-tab tbody th::after, .por-tab thead th:first-child::after': 'maska u přimrzlého sloupce v porovnání — ukazuje, že tabulka pokračuje do strany',
};

/* Animace s vlastním časem — každá s důvodem, proč do tokenu nepatří. */
export const VLASTNI_CAS = {
  livepulse: 'tep u značky „žije" — vlastní rytmus, ne nájezd',
  undersweep: 'linka pod nadpisem přejede jednou při příjezdu, s prodlevou',
  mePulse: 'kroužek u mé značky — tep',
  pkRadar: 'radar na mapě — pulsuje, nenajíždí',
  mnbTocSe: 'točící se kolečko — rychlost otáčky, ne doba nájezdu',
  skShimmer: 'třpyt na zástupném obsahu — rychlost přejezdu',
  mping: 'pink na mapě — tep',
  toTopNudge: 'šťouchnutí šipky „nahoru" — opakuje se',
};

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const css = readFileSync('css/styles.css', 'utf8');
/* Komentáře se vybílí, délka zůstane — čísla řádků pak ukazují na
   opravdový řádek a z komentářů se do nálezů nic nedostane. */
const bez = css.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
const radek = (i) => bez.slice(0, i).split('\n').length;
/* Zdroj vloženého stylu stránky pozemku, ne stránka: do pozemek.html se
   vkládá už očištěný (scripts/vloz-styl-pozemku.mjs), takže nález ve
   stránce by posílal opravovat výstup. */
const vlozenyCisty = readFileSync('css/pozemek-vlozeny.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' '));
/* Selektor pravidla, ve kterém stojí znak na pozici `i`. */
const selektor = (text, i) => {
  const pred = text.slice(0, i);
  const zac = pred.lastIndexOf('{');
  if (zac < 0) return '?';
  const predtim = Math.max(pred.lastIndexOf('}', zac), pred.lastIndexOf('{', zac - 1));
  return pred.slice(predtim + 1, zac).trim().replace(/\s+/g, ' ');
};

/* ---- 1) průhlednost: jeden zápis ---- */
const bezNuly = [];
for (const m of bez.matchAll(/opacity:\s*(\.\d+)/g)) bezNuly.push(`${radek(m.index)}: opacity:${m[1]}`);
pravda('průhlednost se píše s vedoucí nulou (0.85, ne .85 — jinak je to táž hodnota dvakrát)',
  bezNuly.length === 0, bezNuly.slice(0, 8).join('\n      '));

/* ---- 2) průhnost na dvacetinové mřížce ---- */
const mimoMrizku = [];
for (const m of bez.matchAll(/opacity:\s*(0?\.\d+|0|1)(?![0-9])/g)) {
  const v = parseFloat(m[1]);
  if (Math.abs(v / PRUHLEDNOST_KROK - Math.round(v / PRUHLEDNOST_KROK)) > 1e-9) {
    mimoMrizku.push(`${radek(m.index)}: opacity:${m[1]}`);
  }
}
pravda(`a leží na dvacetinové mřížce (krok ${PRUHLEDNOST_KROK})`,
  mimoMrizku.length === 0, mimoMrizku.slice(0, 8).join('\n      '));

/* ---- 3) vlasová linka: čtyři šířky ---- */
const mimoLinky = [];
for (const m of bez.matchAll(/border(?:-top|-right|-bottom|-left)?:\s*([0-9.]+)px/g)) {
  if (LINKY.indexOf(parseFloat(m[1])) < 0) mimoLinky.push(`${radek(m.index)}: ${m[1]}px`);
}
pravda(`rámečky mají jednu ze čtyř šířek (${LINKY.join(', ')} px)`,
  mimoLinky.length === 0, mimoLinky.slice(0, 8).join('\n      '));

/* ---- 4) transition nemá surové trvání ---- */
const suroveP = [];
for (const m of bez.matchAll(/transition(?:-duration)?\s*:\s*([^;}]+)/g)) {
  for (const c of m[1].matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
    if (parseFloat(c[1]) === 0) continue;   // 0s = „neprodlévej", ne trvání
    suroveP.push(`${radek(m.index)}: transition … ${c[0]}`);
  }
}
pravda('přechody berou čas z tokenu (--cas-rychly / --cas-zakladni / --cas-pomaly)',
  suroveP.length === 0, suroveP.slice(0, 8).join('\n      '));

/* ---- 5) nájezdové animace taky ---- */
const suroveA = [];
for (const m of bez.matchAll(/animation\s*:\s*([A-Za-z][\w-]*)([^;}]*)/g)) {
  const jmeno = m[1];
  if (VLASTNI_CAS[jmeno]) continue;                       // doložená výjimka
  const c = /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/.exec(m[2]);
  if (c && parseFloat(c[1]) !== 0) suroveA.push(`${radek(m.index)}: animation:${jmeno} … ${c[0]}`);
}
pravda('a nájezdové animace taky (vlastní čas si drží jen vypsané výjimky)',
  suroveA.length === 0, suroveA.slice(0, 8).join('\n      '));

/* ---- 6) výjimky se nevěří na slovo ---- */
const mrtveVyjimky = Object.keys(VLASTNI_CAS).filter((j) => !new RegExp('@keyframes\\s+' + j + '\\b').test(bez));
pravda('a žádná vypsaná výjimka není mrtvá (ta animace opravdu existuje)',
  mrtveVyjimky.length === 0, mrtveVyjimky.join(', '));

/* ---- poměr stran náhledů ---------------------------------------
   Měří se stylopis I vložený styl stránky pozemku: tatáž osa zapsaná
   ve dvou souborech se rozejde, a právě tam ten rozchod byl. */
{
  const nalezy = [];
  for (const [jmeno, text] of [['css/styles.css', bez], ['css/pozemek-vlozeny.css', vlozenyCisty]]) {
    const re = /aspect-ratio\s*:\s*([^;}]+)/g;
    let m;
    while ((m = re.exec(text))) {
      nalezy.push({ kde: jmeno, sel: selektor(text, m.index),
        hodnota: m[1].trim().replace(/\s+/g, ''),
        radek: text.slice(0, m.index).split('\n').length });
    }
  }
  pravda('je co měřit — poměry stran se ve stylech vůbec vyskytují',
    nalezy.length >= 6, `nalezeno ${nalezy.length}`);
  const cizi = nalezy.filter((n) => n.hodnota !== POMER
    && !(POMER_VYJIMKY[n.sel] && POMER_VYJIMKY[n.sel].je === n.hodnota));
  pravda(`náhledy mají jeden poměr stran (${POMER})`, cizi.length === 0,
    cizi.map((n) => `${n.kde}:${n.radek} ${n.sel} → ${n.hodnota}`).join(' | '));
  const mrtve = Object.keys(POMER_VYJIMKY).filter((sel) => !nalezy.some((n) => n.sel === sel));
  pravda('a žádná vypsaná výjimka není mrtvá (ten selektor opravdu existuje)',
    mrtve.length === 0, mrtve.join(', '));
}

/* A TAKY STRÁNKY, KTERÉ SI NESOU VLASTNÍ STYL. Úklid přelivů projel
   oba stylopisy — jenže ručně psané stránky si část stylu nesou samy ve
   <style> a ten sem nikdy nedosáhl. Naměřeno 20. 10.: pět ozdobných
   přelivů přežilo právě tam (tlačítko na 404.html, plocha karty a záře
   nad ní na muj-inzerat.html, avatar v zpravy.html, ukázka tmavého pásu
   v predloha.html).
   Vyrobené stránky se nečtou: pozemky-* vlastní <style> vůbec nemají a
   pozemek-* do něj dostanou očištěný css/pozemek-vlozeny.css, který se
   čte výš ze zdroje — a že se vkládá opravdu on, hlídá test-vlozeny-styl.
   Předloha pozemek.html je na tom stejně. */
const VYROBENA = /^(pozemek|pozemky)-/;
const vlozeneStranky = readdirSync('.')
  .filter((f) => f.endsWith('.html') && !VYROBENA.test(f) && f !== 'pozemek.html')
  .map((f) => [f, readFileSync(f, 'utf8')])
  .filter(([, h]) => h.indexOf('<style') >= 0)
  .map(([f, h]) => {
    /* Ze stránky zbude jen obsah <style>; všechno ostatní se vybílí na
       mezery, aby čísla řádků v nálezu ukazovala na opravdový řádek. */
    let ven = h.replace(/[^\n]/g, ' ');
    for (const m of h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const zac = m.index + m[0].indexOf(m[1]);
      ven = ven.slice(0, zac) + m[1] + ven.slice(zac + m[1].length);
    }
    return [f, ven.replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' '))];
  });

/* ---- přelivy na ploše --------------------------------------------- */
{
  const nalezy = [];
  for (const [jmeno, text] of [['css/styles.css', bez], ['css/pozemek-vlozeny.css', vlozenyCisty],
    ...vlozeneStranky]) {
    const re = /(background|background-image)\s*:\s*[^;}]*gradient\(/g;
    let m;
    while ((m = re.exec(text))) {
      nalezy.push({ kde: jmeno, sel: selektor(text, m.index),
        radek: text.slice(0, m.index).split('\n').length });
    }
  }
  const bezDuvodu = nalezy.filter((n) => !PRELIVY[n.sel]);
  pravda('každý přeliv na ploše je ve výčtu i s tím, co dělá',
    bezDuvodu.length === 0,
    bezDuvodu.map((n) => `${n.kde}:${n.radek} ${n.sel}`).join(' | ')
      + ' — ozdobný přeliv zploštěte na plnou barvu, funkční dopište do PRELIVY i s důvodem');
  const mrtve = Object.keys(PRELIVY).filter((sel) => !nalezy.some((n) => n.sel === sel));
  pravda(`a žádný vypsaný přeliv není mrtvý (${nalezy.length} na ploše)`,
    mrtve.length === 0, mrtve.join(' | '));
  const kratke = Object.entries(PRELIVY).filter(([, d]) => !d || d.length < 20).map(([k]) => k);
  pravda('a u každého je napsané, proč plnou barvou nejde',
    kratke.length === 0, kratke.join(', '));
}

/* ---- 404.html OPISUJE TOKENY, TAK AŤ OPISUJE SPRÁVNĚ ------------
   Chybová stránka schválně nenačítá css/styles.css: má vyjít i tehdy,
   když se stylopis nestáhne. Všechny barvy, zaoblení a stíny tam proto
   stojí opsané číslem — a opsaná hodnota se tiše rozejde s tí, od které
   byla opsaná. Do 27. 10. se taky rozešla: stránka měla mátovou plochu
   a zaoblení 20 px z předchozí soustavy, kdežto web už měl #F2F4F3
   a 10 px. Tady se porovnává deklarace po deklaraci s tokenem, ze
   kterého pochází. */
{
  const tabulka = {};
  for (const m of bez.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)[;}]/g)) {
    if (!(m[1] in tabulka)) tabulka[m[1]] = m[2].trim();
  }
  const rozbal = (v, hloubka = 0) => (hloubka > 6 ? v
    : v.replace(/var\(\s*--([a-z0-9-]+)\s*\)/g, (_, jm) => rozbal(tabulka[jm] || '', hloubka + 1)));
  const zhustit = (v) => String(v).toLowerCase().replace(/\s+/g, '').replace(/;$/, '');
  const styly = new Map(vlozeneStranky);
  // PŘEDPOKLAD: bez vložených stylů by kontrola proběhla naprázdno
  const chybi = ['404.html', 'inzerce.html', 'diagnostika.html'].filter((f) => !styly.has(f));
  pravda('stránky s vlastním stylem mají co porovnávat', chybi.length === 0, chybi.join(', '));
  {
    /* Hodnota jedné vlastnosti v jednom bloku. Bloky jsou v tom souboru
       ploché (žádné vnoření), takže stačí najít selektor a číst po `}`. */
    const deklarace = (soubor, selektor, vlastnost) => {
      const css = styly.get(soubor);
      if (!css) return null;
      const re = new RegExp('(^|[};])\\s*' + selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
      const blok = re.exec(css);
      if (!blok) return null;
      const v = new RegExp('(^|;)\\s*' + vlastnost.replace(/[-]/g, '\\-') + '\\s*:([^;]*)').exec(blok[2]);
      return v ? v[2].trim() : null;
    };
    const OPSANE = [
      ['404.html', 'body', 'background', 'bg', 'plocha stránky'],
      ['404.html', 'body', 'color', 'text', 'barva textu'],
      ['404.html', '.card', 'background', 'plocha-karta', 'plocha karty'],
      ['404.html', '.card', 'border-radius', 'r-plocha', 'zaoblení karty'],
      ['404.html', '.card', 'box-shadow', 'e1', 'stín karty'],
      ['404.html', 'p', 'color', 'muted', 'barva poznámky'],
      ['404.html', 'a', 'background', 'plocha-znacka', 'plocha tlačítka'],
      ['404.html', 'a', 'border-radius', 'r-md', 'zaoblení tlačítka'],
      ['404.html', 'a', 'box-shadow', 'glow', 'stín tlačítka'],
      ['404.html', 'a.sec', 'color', 'znacka', 'barva záložní akce'],
      /* Přestupní stránka: vidí se na vteřinu, než přesměruje — ale ta
         vteřina má být táž barva jako zbytek webu. */
      ['inzerce.html', 'body', 'background', 'bg', 'plocha přestupní stránky'],
      ['inzerce.html', 'body', 'color', 'text', 'barva textu na přestupní stránce'],
      /* Diagnostika si drží vlastní malý soubor tokenů, protože stylopis
         nenačítá; hodnoty v něm ale mají být tytéž. */
      ['diagnostika.html', ':root', '--bg', 'bg', 'plocha diagnostiky'],
      ['diagnostika.html', ':root', '--card', 'plocha-karta', 'plocha karty v diagnostice'],
      ['diagnostika.html', ':root', '--text', 'text', 'barva textu v diagnostice'],
      ['diagnostika.html', ':root', '--dim', 'muted', 'barva poznámky v diagnostice'],
      ['diagnostika.html', ':root', '--line', 'line', 'obrys v diagnostice'],
    ];
    const rozesle = [];
    for (const [soubor, sel, vl, token, popis] of OPSANE) {
      const naStrance = deklarace(soubor, sel, vl);
      const vTokenu = tabulka[token] === undefined ? null : rozbal(tabulka[token]);
      if (naStrance === null || vTokenu === null || zhustit(naStrance) !== zhustit(vTokenu)) {
        rozesle.push(`${popis} (${soubor} ${sel} ${vl}): „${naStrance}", token --${token} „${vTokenu}"`);
      }
    }
    pravda(`stránky s vlastním stylem opisují tokeny přesně (${OPSANE.length} hodnot)`,
      rozesle.length === 0, rozesle.join(' | '));
    /* Obrysy nesou kromě barvy i šířku, takže se porovnává jen ta barva. */
    const obrysy = [['404.html', '.card', 'line', 'obrys karty'],
      ['404.html', 'a.sec', 'line-strong', 'obrys záložní akce']];
    const spatne = obrysy.filter(([soubor, sel, token]) => {
      const d = deklarace(soubor, sel, 'border');
      return !d || zhustit(d).indexOf(zhustit(rozbal(tabulka[token] || ''))) < 0;
    }).map(([soubor, sel, token, popis]) => `${popis}: ${soubor} ${sel} border „${deklarace(soubor, sel, 'border')}" nenese --${token}`);
    pravda('a obrysy na nich jsou z týchž tokenů', spatne.length === 0, spatne.join(' | '));
  }
}

console.log('\nSoustava: průhlednost, linky, čas, poměr stran, přelivy');
console.log(zpravy.join('\n'));
console.log(`  (výjimek s vlastním časem ${Object.keys(VLASTNI_CAS).length}, každá s napsaným důvodem)`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Soustava: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Novou hodnotu nepřidávej — vyber tu nejbližší, která v soustavě je. Když má'
    + ' animace opravdu mít vlastní rytmus, dopiš ji do VLASTNI_CAS a napiš proč.');
  process.exit(1);
}
