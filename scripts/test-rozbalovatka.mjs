// Test: každé rozbalovátko na webu vypadá jako řazení nad výpisem.
//
// Spuštění: node scripts/test-rozbalovatka.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Majitel 12. 11. nad snímkem „Nového
// hlídání": „a hlavně ať všechny funkce, kde se dělá řazení nebo
// vyhledávání, vypadají jako původní řazení v menu — stejná
// stylizace."
// Naměřeno tehdy: ze třinácti rozbalovátek na webu mělo tu podobu
// JEDNO. js/dropdown.js vylepšoval výhradně `select.map-select`
// a načítal se jen na úvodní stránce, takže řazení nad výpisem mělo
// ikonu, popisek, hodnotu a šipku ve výšce 44 px, kdežto rozbalovače
// v hlídání, v „Přidat nemovitost", v kontaktu, ve smlouvě i jinde
// zůstaly tím, co nakreslí prohlížeč sám — na každém systému jiná
// výška, jiné písmo, jiná šipka.
//
// A PROČ NESTAČILO VZHLED PŘESTĚHOVAT. Při té práci jsem obecné
// pravidlo napsal s BÍLOU plochou, protože bílou má většina desek na
// webu. Předloha ji ale nemá: řazení nad výpisem je --plocha-jemna
// a řez 700. Nová rozbalovátka by tedy vedle své vlastní předlohy
// svítila bíle a o stupeň lehčeji — přesně ten rozdíl, na který
// majitel ukazoval. Nenašel to žádný hlídač, našel jsem to měřením
// omylem. Proto tahle zkouška: PŘEDLOHOU JE ŘAZENÍ NAD VÝPISEM
// a všechno ostatní se měří proti němu, ne proti zapsané hodnotě.
//
// CO SE SROVNÁVÁ A CO NE. Srovnává se to, co vidí oko a co si majitel
// vyžádal: plocha, rám, zaoblení, velikost i řez písma, výška terče
// a stavba (ikona · popisek · hodnota · šipka). NESROVNÁVÁ se šířka
// ani odsazení: nad výpisem stojí rozbalovátko v řádku vedle počtu
// a je úzké podle obsahu, kdežto ve formuláři zabírá celou řádku.
// To není nesrovnalost, to je jiné místo na stránce.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Rozbalovátka', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Stránky, na kterých web nabízí výběr z možností. Kdo sem přidá další
   rozbalovátko, přidá i řádek — a pokud ne, poslední kontrola („žádné
   holé rozbalovátko nezbylo") ho stejně najde na té stránce, kterou
   tu uvedenou máme. */
const STRANKY = [
  { url: '/',                          jm: 'úvod' },
  { url: '/hlidani.html',              jm: 'hlídání',   prihlasit: true, zalozka: 'nove' },
  { url: '/pridat.html',               jm: 'přidání nemovitosti' },
  { url: '/kontakt.html',              jm: 'kontakt' },
  { url: '/kupni-smlouva-pozemek.html', jm: 'kupní smlouva' },
  { url: '/na-co-mam-pozemek.html',    jm: 'na co mám pozemek' },
  { url: '/pravidla-inzerce.html',     jm: 'pravidla inzerce' },
];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, locale: 'cs-CZ', reducedMotion: 'reduce',
  isMobile: true, hasTouch: true });
/* Nejdřív zákaz volání ven, teprve pak podstrčený config.js: pozdější
   cesta má přednost, takže obrácené pořadí by config pustilo na ostrou
   Supabase a stránka by skončila v nouzovém režimu. */
await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1'
  ? r.continue() : r.abort()));
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';window.PK_MAIL_ZAPNUTO=false;` }));
await ctx.addInitScript(() => {
  localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
});
const p = await ctx.newPage();
const chybyStranek = [];
p.on('pageerror', (e) => chybyStranek.push(String(e).slice(0, 110)));

/* Jeden otisk na jedno tlačítko. Záměrně BEZ šířky a odsazení — viz
   poznámka v hlavičce. */
const OTISK = `(e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return {
  plocha: c.backgroundColor,
  ram: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
  tvar: c.borderTopLeftRadius,
  pismo: c.fontSize + '/' + c.fontWeight,
  /* TERČ SE ČTE Z RECEPTU, NE Z KRABICE. Napoprvé tu stála skutečná
     výška a zkouška hlásila „úvod → Nejvýš: 0 px" — ten ovladač leží
     v zavřeném panelu filtrů, takže krabici nemá. Nebyla to vada
     ovladače, byla to vada měření: pravidlo mu 44 px dává stejně jako
     ostatním. Čte se proto min-height, která platí i nevykreslenému,
     a skutečná krabice se navíc ověří u toho, co je zrovna vidět. */
  terc: parseFloat(c.minHeight) || 0,
  krabice: Math.round(r.height),
  videt: !!e.offsetParent,
  ikona: !!e.querySelector('.mcn-ic svg'),
  popisek: !!e.querySelector('.cdd-k'),
  hodnota: !!e.querySelector('.cdd-lbl'),
  sipka: !!e.querySelector('.cdd-sip svg'),
}; }`;

async function otevri(s) {
  await p.goto(BASE + s.url, { waitUntil: 'load' });
  await p.waitForTimeout(s.prihlasit ? 2500 : 1800);
  if (s.zalozka) {
    const z = await p.$(`.hl-tab[data-zalozka="${s.zalozka}"]`);
    if (z) { await z.click(); await p.waitForTimeout(1500); }
  }
  return p.evaluate(`(() => { const o = ${OTISK};
    return {
      tlacitka: [...document.querySelectorAll('.cdd > .cdd-btn')].map((e) => Object.assign(
        { kdo: (e.closest('.cdd') || {}).id || (e.querySelector('.cdd-k') || {}).textContent || '?' }, o(e))),
      predloha: document.querySelector('.ms-vysledky > .cdd > .cdd-btn')
        ? o(document.querySelector('.ms-vysledky > .cdd > .cdd-btn')) : null,
      /* Holé rozbalovátko = <select>, které zůstalo vidět. Skrytý
         originál pod vylepšeným tlačítkem se nepočítá (.cdd-native,
         aria-hidden) a ani ten, u kterého je v HTML napsáno proč
         (data-bez-cdd). */
      hola: [...document.querySelectorAll('select')].filter((e) =>
        !e.classList.contains('cdd-native') && e.getAttribute('aria-hidden') !== 'true'
        && !e.hasAttribute('data-bez-cdd') && !e.hasAttribute('hidden')
        && !e.multiple && e.size <= 1).map((e) => e.id || e.name || '(bez jména)'),
    }; })()`);
}

const vse = {};
for (const s of STRANKY) vse[s.jm] = await otevri(s);

const predloha = vse['úvod'].predloha;
pravda('předloha se našla: řazení nad výpisem na úvodu',
  !!predloha, 'selektor .ms-vysledky > .cdd > .cdd-btn nic nevrátil — bez předlohy nelze srovnávat');

if (predloha) {
  zpravy.push(`  · předloha: ${predloha.plocha} · rám ${predloha.ram} · ${predloha.tvar}`
    + ` · ${predloha.pismo} · ${predloha.terc} px`);
  /* Předloha sama musí mít všechny čtyři části — kdyby je ztratila,
     srovnávalo by se proti ochuzenému vzoru a zkouška by mlčela. */
  pravda('předloha má ikonu, popisek, hodnotu i šipku',
    predloha.ikona && predloha.popisek && predloha.hodnota && predloha.sipka,
    JSON.stringify(predloha));
  pravda('předloha je aspoň 44 px vysoká a je na obrazovce',
    predloha.terc >= 44 && predloha.videt && predloha.krabice >= 44,
    `recept ${predloha.terc} px · krabice ${predloha.krabice} px · vidět ${predloha.videt}`);
}

const KLICE = ['plocha', 'ram', 'tvar', 'pismo'];
let celkem = 0;
for (const s of STRANKY) {
  const v = vse[s.jm];
  celkem += v.tlacitka.length;
  pravda(`${s.jm}: rozbalovátka se vylepšila (${v.tlacitka.length})`,
    v.tlacitka.length > 0, 'na stránce není ani jedno .cdd — dropdown.js se tam nenačetl?');
  for (const t of v.tlacitka) {
    if (!predloha) break;
    const rozdily = KLICE.filter((k) => t[k] !== predloha[k])
      .map((k) => `${k}: předloha „${predloha[k]}" · tady „${t[k]}"`);
    pravda(`${s.jm} → ${t.kdo}: stejná stylizace jako předloha`,
      rozdily.length === 0, rozdily.join(' · '));
    pravda(`${s.jm} → ${t.kdo}: ikona, popisek, hodnota i šipka`,
      t.ikona && t.popisek && t.hodnota && t.sipka,
      `ikona ${t.ikona} · popisek ${t.popisek} · hodnota ${t.hodnota} · šipka ${t.sipka}`);
    pravda(`${s.jm} → ${t.kdo}: terč aspoň 44 px`, t.terc >= 44,
      'min-height je ' + t.terc + ' px');
    if (t.videt) {
      pravda(`${s.jm} → ${t.kdo}: a vykreslený je taky aspoň 44 px`,
        t.krabice >= 44, t.krabice + ' px');
    }
  }
  pravda(`${s.jm}: nezbylo holé rozbalovátko`,
    v.hola.length === 0, 'holých: ' + v.hola.join(', '));
}

/* PŘEDPOKLAD: kdyby se stránky nenačetly, prošly by kontroly výš
   naprázdno. Číslo je proto dole a je to mez na počet, ne na vzhled. */
pravda(`změřilo se aspoň 11 rozbalovátek (${celkem})`, celkem >= 11,
  'našlo se jen ' + celkem + ' — něco se nenačetlo');
pravda(`stránky se vykreslily bez chyby (${chybyStranek.length})`,
  chybyStranek.length === 0, chybyStranek.join(' | '));

console.log('\nJedno rozbalovátko na celý web');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Rozbalovátka: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
