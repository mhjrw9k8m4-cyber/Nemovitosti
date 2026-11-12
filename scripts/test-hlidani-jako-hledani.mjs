// Test: formulář hlídání mluví touž řečí jako hledání na úvodu.
//
// Spuštění: node scripts/test-hlidani-jako-hledani.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Majitel 29. 10. nad snímkem „Nového
// hlídání": „předělej to tak, aby to vypadalo jako vyhledávání v menu,
// které už máme hotové, a pohraj si s tím do detailu."
// Naměřeno tehdy na 390×844, role vedle role:
//   popisek pole      hledání 12/600 verzálky · hlídání 13/700
//   textové pole      hledání bílá plocha, rám 1 px · hlídání šeď, 1,5 px
//   rychlá volba      hledání 44 px · hlídání 38 px (pod mezí dotyku)
//   hlavní tlačítko   hledání 16/700 · hlídání 14/700
//   pilulka „musí mít" hledání 13/600 · hlídání 13/400
//
// JAK SE TO MĚŘÍ A PROČ ZROVNA TAK. Ne na živých prvcích: část
// ovládání hledání si skript stěhuje do překryvu přes celou obrazovku,
// takže by se měřilo podle toho, co je zrovna otevřené. Měří se RECEPT:
// na každé stránce se vyrobí prvek s danou třídou, přečte se jeho
// vypočtený styl a zase se zahodí. Pravidla platí stejně, ať je prvek
// na obrazovce, nebo ne — a srovnávají se tak recepty, ne náhoda.
//
// ODCHYLKA UŽ ŽÁDNÁ NENÍ. Do 9. 11. se tolerovala velikost písma
// v políčku a výběru (hledání 14 px, hlídání 16) s odůvodněním, že pod
// 16 px iPhone stránku při klepnutí zvětší a hledání tu vadu teprve má
// opravit. Opravená je: 16 px má celý web, a tak se i písmo porovnává.
//
// A TŘETÍ STRANA: PŘIDÁNÍ INZERÁTU. Majitel 9. 11. nad snímkem panelu
// filtrů: „toto řazení chci všude, chci, aby to bylo identické
// vizuálně i na hlídání, přidávání inzerátu a všude." Naměřeno tehdy
// na 390 px: formulář inzerátu měl pole v ZAPUŠTĚNÉ ŠEDI s rámem
// 0,14 alfa a odsazením 12 px (hledání bílé, 0,55 alfa, 8 px),
// popisek o pixel menší a volby jako pilulky se systémovým
// zaškrtávátkem. Role, které ta stránka má, se proto srovnávají
// s hledáním stejně jako hlídání.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Hlídání jako hledání', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Role → třída na jedné, na druhé a na třetí straně, a jaký prvek ji
   nese. Hodnota je buď jméno třídy, nebo { trida, obal }, když
   pravidlo platí jen uvnitř něčeho (ve formuláři inzerátu se pole
   popisuje `.add-form input`, tedy bez obalu by se nenašlo). */
const ROLE = [
  { jm: 'popisek pole',    tag: 'span',   hledani: 'mc-cap',      hlidani: 'hl-lbl',    pismo: true },
  { jm: 'textové pole',    tag: 'input',  hledani: 'map-num',     hlidani: 'hl-in',     pismo: true,
    pridat: { trida: '', obal: 'add-form' } },
  { jm: 'výběr',           tag: 'select', hledani: 'map-select',  hlidani: 'hl-sel',    pismo: true,
    pridat: { trida: '', obal: 'add-form' } },
  { jm: 'rychlá volba',    tag: 'button', hledani: 'filter-chip', hlidani: 'hl-rychle', pismo: true },
  { jm: 'pilulka „musí mít"', tag: 'button', hledani: 'filter-chip', hlidani: 'hl-chip', pismo: true },
  { jm: 'hlavní tlačítko', tag: 'button', hledani: 'mcf-hotovo',  hlidani: 'hl-btn',    pismo: true },
  /* TŘI ROLE PŘIBYLY 1. 11. Majitel: „to hledání vizuálně potřebuje
     brutálně překopat, udělej to podobné našemu vyhledávání, které
     mám na hlavní stránce." Recepty jednotlivých prvků se srovnaly
     už 29. 10. (řádky výš) — zbývala STAVBA: rozbalovátko místo
     dlaždic, systémové zaškrtávátko místo přepínače a tři odstavce
     drobného písma místo kolečka „i". Všechny tři věci teď mají
     v hlídání protějšek a hlídají se stejně jako zbytek. */
  { jm: 'dlaždice typu nabídky', tag: 'button', hledani: 'filter-chip', hlidani: 'hl-dlazdice-b', pismo: true },
  /* PŘEPÍNAČ SE SROVNÁVÁ S TÍM V PANELU, NE SE ŠTÍTKEM NAD VÝPISEM.
     Třída .mc-prep má dvě podoby: uvnitř panelu je to dlaždice přes
     celou šířku (.mc-toggles .mc-prep), nad výsledky drobný štítek
     („Uložené", „Porovnat"). Do 9. 11. se hlídání srovnávalo s tím
     štítkem, a tak bylo „Jen celé nemovitosti" pilulka s průhlednou
     plochou. V panelu je to přitom dlaždice jako každá jiná volba —
     a tou je teď i na hlídání. */
  { jm: 'přepínač',        tag: 'button', hledani: { trida: 'mc-prep', obal: 'mc-toggles' },
    hlidani: 'hl-prep',   pismo: true },
  /* VOLBA SE ZAŠKRTNUTÍM. V panelu je to dlaždice v řadě „Co uvádí
     inzerát" (.mcv-btn), na hlídání .hl-dlazdice-b a ve formuláři
     inzerátu .chip-check u sítí („Elektřina", „Voda"). Táž otázka,
     tatáž odpověď, tak i týž tvar. */
  { jm: 'volba se zaškrtnutím', tag: 'button', hledani: 'mcv-btn', hlidani: 'hl-dlazdice-b',
    pridat: 'chip-check', pismo: true },
  { jm: 'kolečko „i"',     tag: 'button', hledani: 'mc-info',     hlidani: 'hl-info',   pismo: false },
  /* Popisek NAD polem (ne název oddílu). V panelu je to .mc-cap uvnitř
     .mc-hodnoty > .mc-rozsah — tam ho pravidlo přepíná na tmavých
     14 px; ve formuláři inzerátu je to prosté <label> v .add-field,
     které bylo do 9. 11. o pixel menší. */
  { jm: 'popisek nad polem', tag: 'span', hledani: { trida: 'mc-cap', obal: 'mc-hodnoty mc-rozsah' },
    pridat: { tag: 'label', trida: '', obal: 'add-field' }, pismo: true },
];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, locale: 'cs-CZ', reducedMotion: 'reduce',
  isMobile: true, hasTouch: true });
/* Nejdřív zákaz volání ven, teprve pak podstrčený config.js: pozdější
   cesta má přednost, takže obrácené pořadí by config pustilo na ostrou
   Supabase a stránka by skončila v nouzovém režimu. (Naměřeno: formulář
   hlídání se pak vůbec nevykreslí a zůstane jen kostra.) */
await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1'
  ? r.continue() : r.abort()));
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';window.PK_MAIL_ZAPNUTO=false;` }));
await ctx.addInitScript(() => {
  localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
});
const p = await ctx.newPage();

const recepty = (strana) => p.evaluate(([role, kam]) => {
  const ven = {};
  for (const r of role) {
    const spec = r[kam];
    if (!spec) continue;                       // tuhle roli ta stránka nemá
    const popis = typeof spec === 'string' ? { trida: spec } : spec;
    /* OBAL MŮŽE BÝT I ŘETĚZ. Některé recepty platí až uvnitř něčeho
       („.add-form input", „.mc-hodnoty .mc-rozsah > .mc-cap"), takže
       se kolem prvku postaví tytéž vrstvy; bez nich by se měřil recept,
       který na stránce nikdy nenastane. */
    const vrstvy = String(popis.obal || '').split(/\s+/).filter(Boolean);
    let kam2 = document.body;
    const koren = [];
    for (const tr of vrstvy) {
      const o = document.createElement('div'); o.className = tr;
      kam2.appendChild(o); koren.push(o); kam2 = o;
    }
    const e = document.createElement(popis.tag || r.tag);
    e.className = popis.trida || '';
    kam2.appendChild(e);
    const c = getComputedStyle(e);
    ven[r.jm] = {
      tvar: c.borderRadius,
      ram: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
      plocha: c.backgroundColor,
      ink: c.color,
      vyska: c.minHeight,
      /* MIN-WIDTH TU DŘÍV NEBYL a propadlo tím kolečko s vysvětlivkou:
         panel mu dává min-width:44px i min-height:44px, já opsal jen
         výšku, takže terč měl 36×44 px. Shoda výšek na to nestačí. */
      sirka: c.minWidth,
      pismo: c.fontSize + '/' + c.fontWeight,
    };
    e.remove();
    if (koren.length) koren[0].remove();
  }
  return ven;
}, [role, strana]);
const role = ROLE;

await p.goto(BASE + '/index.html', { waitUntil: 'load' });
await p.waitForSelector('#ms-rozsirene', { timeout: 25000 }).catch(() => null);
await p.waitForTimeout(800);
const A = await recepty('hledani');
/* JAK SE TA VĚC JMENUJE, ne jak vypadá. Recepty výš srovnávají vzhled;
   tohle srovnává SLOVA. Majitel 12. 11.: „navíc je tam plno věcí, co
   nedávají smysl, oprav to hned." Nejhorší z nich byla dvojice jmen:
   na úvodu je „Druh nabídky" prodej/dražba/exekuce a „Druh pozemku"
   orná půda/zahrada — a v hlídání to bylo PROHOZENÉ, takže tatáž dvě
   slova znamenala na dvou obrazovkách opačné věci. Vzhledu si toho
   žádný hlídač nevšiml, protože vzhled byl v pořádku. */
const jmenaHledani = await p.evaluate(() => {
  const cap = (sel) => { const e = document.querySelector(sel); const f = e && e.closest('.mc-field');
    const c = f && f.querySelector('.mc-cap'); return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; };
  return { druhNabidky: cap('#map-filters'), druhPozemku: cap('#mc-druhy') };
});

await p.goto(BASE + '/hlidani.html', { waitUntil: 'load' });
await p.waitForSelector('#ns-okres', { state: 'attached', timeout: 25000 }).catch(() => null);
await p.waitForTimeout(800);
const B = await recepty('hlidani');
/* Že se formulář opravdu vykreslil, ne že jen stránka doběhla: recept
   by se přečetl i na prázdné stránce (pravidla jsou ve stylu), takže
   bez téhle kontroly by zkouška mohla projít nad kostrou. */
const jeFormular = await p.evaluate(() => !!document.getElementById('ns-okres'));
const jednotky = await p.evaluate(() => [...document.querySelectorAll('.hl-lbl .jednotka, .mc-cap .jednotka')]
  .map((e) => getComputedStyle(e).textTransform));
/* Jméno ovladače je to, čím ho obrazovka člověku představí — ať je to
   viditelný popisek (dlaždice druhu nabídky), nebo `aria-label`
   rozbalovátka, které si popisek nese samo na tlačítku. Obojí je
   jméno; srovnává se proto obojí se svým protějškem v hledání. */
const jmenaHlidani = await p.evaluate(() => {
  const t = (sel, atr) => { const e = document.querySelector(sel); if (!e) return null;
    return (atr ? (e.getAttribute(atr) || '') : e.textContent).replace(/\s+/g, ' ').trim(); };
  return { druhNabidky: t('#ns-type-lbl'), druhPozemku: t('#ns-druh', 'aria-label'),
    slib: t('.hl-new-head span'), souhrn: t('#ns-souhrn') };
});

await p.goto(BASE + '/pridat.html', { waitUntil: 'load' });
await p.waitForTimeout(800);
const C = await recepty('pridat');
/* Že jsme opravdu na stránce inzerátu: recept by se přečetl i jinde
   (pravidla jsou ve společném stylopisu), takže bez téhle kontroly by
   se mohlo srovnávat nad kteroukoli stránkou. */
const jePridat = await p.evaluate(() => !!document.querySelector('form.add-form, .add-sekce'));
await prohlizec.close();

pravda('formulář hlídání se vykreslil (jinak by se recepty četly nad prázdnem)',
  jeFormular === true, 'ns-okres v dokumentu není');

pravda('stránka s inzerátem se vykreslila (jinak by se recepty četly jinde)',
  jePridat === true, 'form.add-form ani .add-sekce v dokumentu není');

const VLASTNOSTI = ['tvar', 'ram', 'plocha', 'ink', 'vyska', 'sirka'];
const jmenoTridy = (spec) => (typeof spec === 'string' ? spec : spec && spec.trida) || '(bez třídy)';
function srovnej(r, a, druha, jmeno, spec) {
  if (!a || !druha) return;
  const rozdily = VLASTNOSTI.filter((k) => a[k] !== druha[k])
    .map((k) => k + ': hledání „' + a[k] + '" · ' + jmeno + ' „' + druha[k] + '"');
  if (r.pismo && a.pismo !== druha.pismo) rozdily.push('písmo: hledání ' + a.pismo + ' · ' + jmeno + ' ' + druha.pismo);
  pravda(`${r.jm}: tentýž recept na ${jmeno} (.${jmenoTridy(r.hledani)} = .${jmenoTridy(spec)})`,
    rozdily.length === 0, rozdily.join('\n      '));
}
let sPridanim = 0;
for (const r of ROLE) {
  srovnej(r, A[r.jm], B[r.jm], 'hlídání', r.hlidani);
  if (r.pridat) { srovnej(r, A[r.jm], C[r.jm], 'inzerát', r.pridat); sPridanim++; }
}
/* --- STEJNÁ VĚC SE JMENUJE STEJNĚ --------------------------------- */
for (const [klic, co] of [['druhNabidky', 'prodej, dražba, exekuce'],
                          ['druhPozemku', 'orná půda, zahrada, les']]) {
  const h = jmenaHledani[klic], l = jmenaHlidani[klic];
  pravda(`${co}: v hledání i v hlídání se to jmenuje stejně`,
    !!h && !!l && h === l, `hledání „${h}" · hlídání „${l}"`);
}

/* SLIB NESMÍ SLIBOVAT UŽŠÍ VĚC, NEŽ CO HLÍDÁNÍ DĚLÁ. Věta nad
   formulářem zvala na „pozemek, který sedí", zatímco souhrn na jeho
   konci počítá nemovitosti — web sbírá i domy a byty (§412). Kdo
   hledá chalupu, tu větu přečte a odejde. Měří se vzájemně: jakmile
   souhrn mluví o nemovitostech, slib nesmí mluvit jen o pozemcích. */
{
  const slib = jmenaHlidani.slib || '';
  const souhrn = jmenaHlidani.souhrn || '';
  const siroky = /nemovitost/i.test(souhrn);
  const uzky = /pozem(ek|ky|ků|kem|ku)/i.test(slib);
  pravda('slib nad formulářem neslibuje užší věc, než souhrn počítá',
    !siroky || !uzky, `souhrn „${souhrn}" · slib „${slib}"`);
}

/* PŘEDPOKLAD: bez rolí, které má i formulář inzerátu, by se o té
   stránce netvrdilo nic a kontroly výš by platily jen o dvou. */
pravda(`a formulář inzerátu se srovnává aspoň ve třech rolích (${sPridanim})`,
  sPridanim >= 3, 'rolí s protějškem na pridat.html je ' + sPridanim);

/* A ještě jedna vada, kterou tahle práce odkryla: popisek pole je
   verzálkami, takže „Cena (Kč)" se vysázelo jako „CENA (KČ)"
   a „Výměra (m²)" jako „VÝMĚRA (M²)" — obojí je chybný zápis
   jednotky. Jednotka proto stojí ve vlastním <span class="jednotka">
   s vypnutým přepisem, a to na OBOU stránkách. */
pravda(`jednotka v popisku se nepíše verzálkami (${jednotky.length} nalezeno)`,
  jednotky.length > 0 && jednotky.every((t) => t === 'none'),
  JSON.stringify(jednotky));

console.log('\nJedna řeč ovládání: hledání, hlídání i přidání inzerátu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlídání jako hledání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
