/* Test: cizí text se na webu vykreslí jako TEXT, ne jako kód.
   ==================================================================
   Spuštění: node scripts/test-escape-dom.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ. Funkce, která escapuje HTML, je na webu napsaná v jedenácti
   kopiích (deset v js/*.js, jedna přímo v zpravy.html) a nejsou
   doslova stejné — jedna escapuje i apostrof, ostatní ne. Nic přitom
   nehlídalo, že dvanáctá kopie nezapomene. CSP od 23. 10. podstrčený
   skript nespustí (viz scripts/test-csp.mjs), ale to je druhá pojistka;
   tahle zkouška měří PRVNÍ — tedy samo escapování.

   PROTO SE TU CSP OBCHÁZÍ (bypassCSP). Kdyby se neobcházela, zkouška
   by prošla i nad dírou v escapování: skript by zastavila hlavička a
   nebylo by poznat, že se cizí text dostal do HTML jako kód.

   JAK SE MĚŘÍ. Do dat se podstrčí tři obvyklé nálože (obrázek
   s onerror, svg s onload, značka script) a u každé stránky se ptá na
   tři věci:
     1. nespustilo se nic (window.__XSS zůstalo nedefinované),
     2. v DOM nevznikl žádný prvek, který by ta nálož vyrobila
        (img[onerror], svg[onload], script s tím obsahem),
     3. ten text je přitom na stránce VIDĚT — jinak by zkouška mohla
        projít nad stránkou, která data vůbec nevykreslila, a o
        escapování by neřekla nic.

   CO SE TÍM NAMĚŘILO. Nálož se nedostane ani k escapování: první
   obranou je ČIŠTĚNÍ DAT. `text()` v js/cisteni.js zahazuje znaky
   < > a dvojitou uvozovku úplně, takže z „<img src=x onerror=…>"
   zbyde na kartě „img src=x onerror=…" jako text. Escapování je druhá
   pojistka (pro cesty, které čištěním neprojdou — třeba zprávy mezi
   lidmi), CSP třetí. Kontrola 3 proto hledá podobu BEZ těch znaků;
   kdyby čištění vypadlo a zbylo jen escapování, projde taky — na
   bezpečnosti se nic nemění a kontroly 1 a 2 to pořád hlídají.

   CO TAHLE ZKOUŠKA NEMĚŘÍ: zprávy mezi lidmi (zpravy.html má vlastní
   kopii escapování a cizí text tam čištěním dat neprochází). To je
   vlastní zkouška, ne přívěsek k téhle.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8313;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Escapování', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) STATICKY: co všechny kopie escapují ---------------------- */
/* Kopie se poznají podle toho, že v nich stojí &amp; — to je ta
   náhrada, bez které se žádné escapování nedá napsat. */
{
  const soubory = [];
  for (const f of readdirSync(path.join(KOREN, 'js'))) if (/\.js$/.test(f)) soubory.push(path.join('js', f));
  for (const f of readdirSync(KOREN)) if (/\.html$/.test(f) && !/^pozemek-|^pozemky-/.test(f)) soubory.push(f);
  const kopie = [], neuplne = [];
  for (const rel of soubory) {
    const t = readFileSync(path.join(KOREN, rel), 'utf8');
    if (t.indexOf('&amp;') < 0) continue;
    kopie.push(rel);
    /* Čtyři znaky jsou povinné minimum: & < > a dvojitá uvozovka.
       Bez & se dvojí escapování rozsype, bez < > projde značka, bez
       uvozovky se dá vyskočit z atributu. */
    for (const [znak, nahrada] of [['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;']]) {
      if (t.indexOf(nahrada) < 0) { neuplne.push(`${rel} (chybí ${znak} → ${nahrada})`); break; }
    }
  }
  pravda(`escapování se v repozitáři opravdu našlo (${kopie.length} míst)`, kopie.length >= 5, `nalezeno ${kopie.length}`);
  pravda('a každé z nich escapuje aspoň & < > a dvojitou uvozovku',
    neuplne.length === 0, neuplne.slice(0, 3).join(' | '));
}

/* ---- server, který umí podstrčit nepřátelská data ---------------- */
const NALOZE = [
  '<img src=x onerror="window.__XSS=1">',
  '"><svg onload="window.__XSS=2"></svg>',
  '</b><script>window.__XSS=3</script>',
];
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

/* Do dat se nálože dosadí jen do TEXTOVÝCH polí; čísla a souřadnice
   musí zůstat platné, jinak by stránka nabídku zahodila a zkouška by
   měřila prázdno. */
function otraveno(surovy) {
  const d = JSON.parse(surovy);
  const pole = Array.isArray(d) ? d : d.opportunities;
  if (!Array.isArray(pole) || !pole.length) throw new Error('v datech nejsou nabídky — zkouška by měřila prázdno');
  /* NÁLOŽ SE DOSADÍ DO NABÍDEK, KTERÉ VÝPIS OPRAVDU UKÁŽE. Spoluvlastnické
     podíly web ve výchozím stavu skrývá (26 % nabídek), takže nálož
     v prvních třech řádcích dat se na stránku vůbec nemusela dostat —
     a zkouška by pak měřila prázdno a tvrdila, že je vše v pořádku.
     Druh se nechává být: podle něj se filtruje a řadí. */
  const vhodne = pole.filter((x) => x && !x.podil && x.price > 0 && x.area > 0);
  if (vhodne.length < NALOZE.length) throw new Error('v tomhle řezu není dost celých pozemků');
  /* DO VŠECH, NE DO PRVNÍCH TŘÍ. Výpis ukazuje jen prvních šedesát
     řádků v nějakém pořadí (nejnovější nahoře) a ze 1 392 celých
     pozemků se nálož v prvních třech záznamech dat na obrazovku vůbec
     nedostala — zkouška pak hlásila „nespustilo se nic" nad stránkou,
     kde žádná nálož nebyla. Naměřeno. */
  vhodne.forEach((x, i) => {
    const n = NALOZE[i % NALOZE.length];
    x.place = n + ' Zkouskov';
    x.extra = n;
    x.parcel = n;
  });
  return JSON.stringify(d);
}

const server = createServer((q, s) => {
  const u = decodeURIComponent((q.url || '/').split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end('ne'); }
  let telo = readFileSync(f);
  if (/data[/\\](opportunities\.json|okres[/\\][^/\\]+\.json|mapa\.json)$/.test(f)) {
    try { telo = Buffer.from(otraveno(telo.toString('utf8')), 'utf8'); if (process.env.PK_LADENI) console.error('[nálož] ' + path.basename(f)); }
    catch (e) { if (process.env.PK_LADENI) console.error('[bez nálože] ' + path.basename(f) + ': ' + e.message); }
  }
  s.setHeader('content-type', TYPY[path.extname(f)] || 'application/octet-stream');
  s.end(telo);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/* ---- 2) V PROHLÍŽEČI --------------------------------------------- */
/* MĚŘÍ SE TAM, KDE CIZÍ TEXT PŘICHÁZÍ AŽ V PROHLÍŽEČI. Úvodní stránka
   si bere řez data/mapa.json, stránka pozemku řez svého okresu —
   v obou případech jde text z dat přes JavaScript do HTML, tedy přes
   čištění a escapování. Okresní a krajské stránky v seznamu NEJSOU:
   ty skládá generátor při sestavení a nic dalšího si nedotahují, takže
   by zkouška měřila prázdno. (Escapování v generátorech je vlastní
   otázka a vlastní zkouška.) */
const pozemek = readdirSync(KOREN).find((f) => /^pozemek-.+\.html$/.test(f));
const STRANKY = ['index.html'];
if (pozemek) STRANKY.push(pozemek);

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  const spustilo = [], prvky = [], neviditelne = [], ostre = [];
  for (const s of STRANKY) {
    /* KAŽDÁ STRÁNKA VE VLASTNÍM PROHLÍŽEČI (novém kontextu), ne jen
       v nové záložce. Po návštěvě úvodní stránky se nálož v seznamu
       srovnatelných pozemků neobjevila: stránka si vzala, co už bylo
       uložené v prohlížeči z předchozí návštěvy, a čerstvý řez okresu
       si nestáhla. Naměřeno — a kdyby se to nechalo být, zkouška by
       mlčela o stránce, kterou vůbec neprověřila.
       bypassCSP schválně — viz hlavička. */
    const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/${s}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(5000);
    /* SJET DOLŮ. Srovnatelné pozemky (tedy právě ten seznam, kam cizí
       text z řezu okresu teče) jsou na stránce pozemku až pod cenou a
       popisem a dotahují se, teprve až jsou na dohled. Bez sjetí
       zkouška měřila stránku, na které nálož ještě nebyla. */
    /* Sjet dolů: srovnatelné pozemky (kam cizí text z řezu okresu
       teče) se dotahují, teprve až jsou na dohled. */
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => ({
      xss: typeof window.__XSS !== 'undefined' ? String(window.__XSS) : null,
      zlePrvky: [
        ...document.querySelectorAll('img[onerror], svg[onload], [onerror], [onload]'),
      ].length,
      zleSkripty: [...document.querySelectorAll('script')].filter((x) => /__XSS/.test(x.textContent || '')).length,
      /* Značka, že otrávená data DORAZILA na stránku: slovo z pole
         `place`. Celý text nálože by nestačil — stránka pozemku si
         jméno obce zkracuje, takže z „img src=x onerror=… Zkouskov"
         zbyde v seznamu srovnatelných jen „Zkouskov". Naměřeno; kdyby
         se hledalo „onerror=", zkouška by u té stránky hlásila, že
         data nedorazila, zatímco dorazila a byla zneškodněná. */
      vidimText: (document.body.innerText || '').indexOf('Zkouskov') >= 0,
      ostreZnaky: /<(img|svg|script)\b/.test(document.body.innerText || ''),
      uzlu: document.querySelectorAll('*').length,
    }));
    /* PK_LADENI=1 vypíše, co zkouška na každé stránce viděla. Když
       padne na „data nedorazila", je to první věc, kterou člověk
       potřebuje — bez toho se hledá naslepo. */
    if (process.env.PK_LADENI) console.error(`[ladění] ${s}: dorazilo=${r.vidimText} prvků=${r.zlePrvky} skriptů=${r.zleSkripty} uzlů=${r.uzlu}`);
    if (r.xss !== null) spustilo.push(`${s}: __XSS=${r.xss}`);
    if (r.zlePrvky || r.zleSkripty) prvky.push(`${s}: prvků ${r.zlePrvky}, skriptů ${r.zleSkripty}`);
    if (!r.vidimText) neviditelne.push(`${s}: ${r.uzlu} uzlů`);
    if (r.ostreZnaky) ostre.push(s);
    await ctx.close();
  }
  pravda(`na ${STRANKY.length} typech stránek se nálož NESPUSTILA`, spustilo.length === 0, spustilo.join(' | '));
  pravda('a nevznikl z ní ani jeden prvek v DOM', prvky.length === 0, prvky.join(' | '));
  pravda('a přitom otrávená data na stránku dorazila (jinak by se neměřilo nic)',
    neviditelne.length === 0, neviditelne.join(' | '));
  /* Není to podmínka bezpečnosti, ale doklad, KTEROU obranou to prošlo:
     dnes čištěním dat, které ostré znaky zahazuje. Kdyby se to změnilo
     na escapování, tahle kontrola spadne a bude to k přečtení — ne
     k opravě naslepo. */
  pravda('a prošla přitom čištěním dat (ostré znaky < > \" jsou pryč)',
    ostre.length === 0, `s ostrými znaky: ${ostre.join(', ')} — pak platí jen escapování, viz hlavička`);
} finally {
  await prohlizec.close();
  server.close();
}

console.log('\nCizí text se vykreslí jako text');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Escapování: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
