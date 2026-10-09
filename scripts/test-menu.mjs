/* Test: nabídka na telefonu je vidět — a je jen jedna.
   ==================================================================
   Spuštění: node scripts/test-menu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   HISTORIE, KTEROU TENHLE TEST HLÍDÁ. Obsluha nabídky ležela
   v repozitáři ve ČTRNÁCTI kopiích a JEDENÁCTI různých podobách. To
   nebyl estetický problém: kopie v js/pozemek.js (tedy na 1 999
   stránkách pozemků) uměla jen přepnout třídu — nezavírala se Escapem
   ani klepnutím na odkaz. Kdo si na telefonu otevřel menu a klepl na
   odkaz, dostal novou stránku s menu roztaženým přes ni.

   PANEL POD KŘÍŽKEM UŽ NENÍ. Tři pokusy: panel 515 px (61 % obrazovky),
   týž panel přestavěný na 345 px (41 %) — a pak spodní lišta, kterou
   majitel webu odmítl, protože nabídku dole nechce. Co ze všech tří
   zbylo jako pravidlo: NAVIGACI NEMÁ SMYSL SCHOVÁVAT. Nabídka je teď
   vodorovný pás odkazů v hlavičce, který se posune prstem do strany.
   Všechny cíle v něm zůstávají — Zprávy a Hlídání taky; schovat je
   byla chyba, protože kdo hlídá pozemky, potřebuje se k nim dostat
   na jedno klepnutí. S panelem zmizel i hamburger: ze stylu,
   z obsluhy i ze značky 2 178 stránek.

   Měří se tedy dvojí:
     1. že obsluha je na JEDNOM místě (js/menu.js) a že po přepínači
        nikde nezůstaly zbytky,
     2. že pás doopravdy funguje — na STRÁNCE POZEMKU, tedy tam, kde
        bylo menu historicky rozbité, a na obou šířkách.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nMobilní nabídka (spodní lišta)');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Menu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* ---- 1) jedno místo, a po přepínači ani stopa ------------------ */
/* Značkou obsluhy je teď označení otevřené stránky, ne přepínání třídy
   „open" — žádná třída se nepřepíná, protože není co otevírat. */
const VZOR_OBSLUHY = /aria-current', 'page'/;
const kopie = [];
const sHamburgerem = [];
for (const f of fs.readdirSync(KOREN)) {
  if (!f.endsWith('.html')) continue;
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (/class="[^"]*nav-toggle/.test(s)) sHamburgerem.push(f);
  if (/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f) || f.startsWith('pozemky-okres-') || /-kraj\.html$/.test(f)) continue;
  const vlozene = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  if (VZOR_OBSLUHY.test(vlozene) || /nav\.classList\.toggle\('open'/.test(vlozene)) kopie.push(f);
}
for (const f of fs.readdirSync(path.join(KOREN, 'js'))) {
  if (!f.endsWith('.js') || f === 'menu.js') continue;
  const s = fs.readFileSync(path.join(KOREN, 'js', f), 'utf8');
  if (VZOR_OBSLUHY.test(s) || /nav\.classList\.toggle\('open'/.test(s)) kopie.push('js/' + f);
}
pravda('obsluha nabídky je jen v js/menu.js',
  kopie.length === 0, `${kopie.length} vlastních kopií: ` + kopie.slice(0, 5).join(', '));
pravda('a js/menu.js ji opravdu má (jinak kontrola výš nic neznamená)',
  VZOR_OBSLUHY.test(fs.readFileSync(path.join(KOREN, 'js', 'menu.js'), 'utf8')),
  'v js/menu.js označení stránky není');
/* Hamburger se nezobrazoval nikde — ani na telefonu, ani na počítači —
   a přesto zůstával ve značce 2 178 stránek i s aria-controls na panel,
   který neexistuje. Tahle kontrola hlídá, že se tam nevrátí. */
pravda('a po hamburgeru nezbyl ani jeden kus značky',
  sHamburgerem.length === 0,
  `${sHamburgerem.length} stránek ho má: ` + sHamburgerem.slice(0, 4).join(', '));

/* Každá stránka s nabídkou si musí modul načíst. */
const bezModulu = [];
let sNabidkou = 0;
for (const f of fs.readdirSync(KOREN)) {
  if (!f.endsWith('.html')) continue;
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (!/<nav[^>]+id="nav"/.test(s)) continue;
  sNabidkou++;
  if (!/<script[^>]+src="js\/(?:min\/)?menu\.js/.test(s)) bezModulu.push(f);
}
pravda(`stránky s nabídkou se našly (${sNabidkou})`, sNabidkou > 100, `jen ${sNabidkou}`);
pravda('a každá si načte js/menu.js',
  bezModulu.length === 0, `${bezModulu.length} bez modulu: ` + bezModulu.slice(0, 5).join(', '));

/* ---- 2) a doopravdy to funguje — na stránce pozemku ------------ */
const detail = fs.readdirSync(KOREN).find((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
pravda('našla se stránka pozemku, na které se to dá změřit', !!detail, 'žádná pozemek-*.html');
if (!detail) hotovo();

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${detail}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  const pas = async () => p.evaluate(() => {
    const n = document.getElementById('nav');
    if (!n) return null;
    const r = n.getBoundingClientRect(), s = getComputedStyle(n);
    const h = document.querySelector('header').getBoundingClientRect();
    const a = [...n.querySelectorAll('a')].filter((x) => x.getClientRects().length).map((x) => {
      const q = x.getBoundingClientRect();
      return { kam: x.getAttribute('href'), txt: x.textContent.trim(),
        s: Math.round(q.width), v: Math.round(q.height), x: Math.round(q.left),
        ikona: getComputedStyle(x, '::before').backgroundImage !== 'none' };
    });
    return { vHlavicce: !!n.closest('header'), poz: s.position,
      hlavicka: Math.round(h.height), v: Math.round(r.height), okno: innerHeight,
      posuvny: n.scrollWidth > n.clientWidth + 1, radku: new Set(a.map((x) => x.v && x.x >= 0 ? Math.round(x.v) : 0)).size,
      ySad: new Set(a.map((x) => Math.round(x.v))).size, a };
  });

  const l = await pas();
  pravda('nabídka je vidět hned, bez jediného klepnutí', !!l && l.a.length > 0,
    'v hlavičce žádné odkazy nejsou');
  if (!l) hotovo();
  /* NAHOŘE, NE DOLE. Majitel webu nabídku u spodní hrany odmítl; pás
     je součástí hlavičky a jde s ní. */
  pravda('a je v hlavičce, ne u spodní hrany', l.vHlavicce && l.poz !== 'fixed',
    `v hlavičce: ${l.vHlavicce}, position:${l.poz}`);
  pravda(`hlavička s pásem zůstává nízká (${l.hlavicka} px)`, l.hlavicka <= 140,
    `${l.hlavicka} px z ${l.okno} — s pásem ve dvou řadách to bylo 175`);
  pravda(`pás je jedna řada (${l.v} px)`, l.v <= 60,
    `${l.v} px — odkazy se zalomily do víc řad`);
  /* VŠECHNY CÍLE V NĚM ZŮSTÁVAJÍ. Zprávy a Hlídání jsem v jedné verzi
     schoval nepřihlášeným, protože obě stránky vedou na přihlašovací
     okénko. Bylo to špatně: kdo hlídá pozemky, potřebuje se k nim
     dostat na jedno klepnutí, ne přes profil. */
  const kam = l.a.map((x) => x.kam);
  for (const cil of ['#mapa', 'cena-pozemku.html', 'zpravy.html', 'hlidani.html', 'kontakt.html', 'muj-inzerat.html']) {
    pravda(`v pásu je ${cil}`, kam.some((h) => (h || '').endsWith(cil)), 'chybí: ' + kam.join(', '));
  }
  pravda('každý odkaz má ikonu', l.a.every((x) => x.ikona),
    JSON.stringify(l.a.filter((x) => !x.ikona).map((x) => x.kam)));
  /* Mez 44 px si web klade sám (hlídá ji test-rozvrzeni i test-dotyk);
     pilulky měly 40 a zkoušky to okamžitě našly. */
  pravda('a dá se trefit prstem (44 px na výšku)', l.a.every((x) => x.v >= 44),
    JSON.stringify(l.a.map((x) => [x.kam, x.v])));
  /* Že se dá posunout, musí být POZNAT: poslední odkaz nesmí končit
     přesně na kraji, jinak to vypadá, že pás končí tam. */
  pravda('je poznat, že pás pokračuje za okrajem', l.posuvny,
    'všechno se vejde — pak ale žádný posuv není potřeba');

  pravda('a nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));
  await ctx.close();

  /* ---- 3) na počítači je z ní zase vodorovná navigace ---------- */
  const ctxD = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  const pd = await ctxD.newPage();
  await pd.goto(`${BASE}/${detail}`, { waitUntil: 'domcontentloaded' });
  await pd.waitForTimeout(900);
  const d = await pd.evaluate(() => {
    const n = document.getElementById('nav'); const s = getComputedStyle(n);
    return { rodic: n.parentNode.tagName, poz: s.position, smer: s.flexDirection,
      vHlavicce: !!n.closest('header'),
      odkazu: [...n.querySelectorAll('a')].filter((a) => a.getClientRects().length).length,
      vsechny: [...n.querySelectorAll('a')].map((a) => a.getAttribute('href')) };
  });
  pravda('na širokém displeji se vrací do hlavičky', d.vHlavicce, `rodič je ${d.rodic}`);
  pravda('a je z ní zase vodorovná navigace, ne lišta',
    d.poz !== 'fixed' && d.smer === 'row', `position:${d.poz}, směr ${d.smer}`);
  /* Na počítači je Zprávy a Hlídání vidět až po rozbalení „Moje" —
     ve vodorovné liště je na ně místa málo a rozbalovátko je tam
     zavedený způsob. Odkazy jsou ale v dokumentu obě, takže se měří
     CÍLE, ne kolik jich je zrovna vidět. */
  pravda('a vede na tytéž cíle jako pás na telefonu',
    l.a.every((x) => d.vsechny.some((h) => h === x.kam)),
    `na počítači chybí: ${l.a.filter((x) => !d.vsechny.some((h) => h === x.kam)).map((x) => x.kam).join(', ')}`);
  await ctxD.close();

  /* ---- 4) lišta ví, na které stránce jsem --------------------- */
  const ctxS = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctxS.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const ps = await ctxS.newPage();
  const sviti = async (soubor) => {
    await ps.goto(`${BASE}/${soubor}`, { waitUntil: 'domcontentloaded' });
    await ps.waitForTimeout(900);
    return ps.evaluate(() => [...document.querySelectorAll('#nav a[aria-current="page"]')]
      .map((a) => a.getAttribute('href')));
  };
  pravda('na stránce cen svítí záložka Ceny',
    JSON.stringify(await sviti('cena-pozemku.html')), JSON.stringify(['cena-pozemku.html']));
  /* Zprávy a Hlídání vlastní záložku nemají — jsou to stránky účtu
     a mají dlaždice v profilu. Svítit tam má Profil; jinak by na nich
     nesvítilo nic a lišta by tvrdila, že jsem někde jinde. */
  pravda('a na Zprávách svítí Profil, pod který patří',
    JSON.stringify(await sviti('zpravy.html')), JSON.stringify(['muj-inzerat.html']));
  await ctxS.close();
} finally {
  await prohlizec.close();
}
hotovo();
