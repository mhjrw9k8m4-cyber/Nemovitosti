/* Diagnostika: nálezy sond se opravdu vykreslí (a cizí text se nevykoná)
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-diagnostika-zdroje.mjs

   PROČ TENHLE SOUBOR VZNIKL. diagnostika.html je stránka, kterou
   majitel otevře, když něco nefunguje — a nálezy obou sond (odkud
   ještě jde brát, co říkají cizí podmínky) na ní byly jediným místem,
   kde se k člověku dostanou. Přitom na ni NEBYLA ani jedna funkční
   zkouška: že se blok vykreslí, se dalo poznat jen okem.

   Že to není teorie: při psaní bloku o podmínkách jsem tam čet
   `z.odkaz` a `z.oAutomatu` — ani jedno v nálezu sondy neexistuje.
   Stránka by mlčela a nic by to neukázalo. Tahle zkouška přesně to
   měří: podstrčí vymyšlený nález a kouká, co z něj na stránce JE.

   A měří i druhou věc: jména zdrojů a adresy v tom nálezu jsou TEXT
   Z CIZÍHO WEBU. Kdyby se vkládaly bez escapování, byla by to cesta,
   jak do majitelovy diagnostiky dostat cizí kód. Fixtura proto nese
   nálož a zkouška hlídá, že z ní nevznikne ani jeden prvek.
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const NALOZ = '<img src=x onerror="window.PK_PRASKLO=1">';
/* FIXTURA MÁ TVAR SKUTEČNOSTI (§337). Napoprvé jsem si tvar nálezu
   vymyslel — a stránka na něm TICHO padla: vykreslování visí v řetězu
   slibů, takže chybějící pole skončí ODMÍTNUTÝM SLIBEM, ne výjimkou,
   a v okně zůstane jediný řádek. Fixtura se proto bere z opravdového
   nálezu v data/ a mění se v ní jen to, co zkouška měří: do jména
   prvního zdroje se vloží nálož. */
function fixtura(soubor, uprav) {
  const N = JSON.parse(readFileSync(path.join(KOREN, 'data', soubor), 'utf8'));
  uprav(N);
  return N;
}
const SONDA = fixtura('zdroje-sonda.json', (N) => {
  N.updated = '2026-11-03';
  /* NÁLOŽ MUSÍ DOJÍT DO TÉ VĚTVE, KTERÁ SE MĚŘÍ. Napoprvé jsem ji dal
     jen do prvního zdroje — a ten je zapojený, takže se vypisuje jako
     NÁZEV řádku (přes textContent, tedy bezpečně). Sabotáž „jméno
     zpět bez escapování" v seznamu SLIBNÝCH kandidátů pak prošla
     zeleně: kontrola na to místo nedosáhla. Nálož proto jde i do
     prvního slibného kandidáta, protože právě jeho jméno se vkládá
     do DETAILU, a ten se vkládá jako HTML. */
  const kam = [];
  if (N.zdroje && N.zdroje[0]) kam.push(N.zdroje[0]);
  const slibny = (N.zdroje || []).find((z) => z.stav !== 'zapojeno' && z.slibuje === 'slibné');
  if (!slibny) throw new Error('v nálezu sondy není slibný kandidát — nálož by neměla kam jít');
  kam.push(slibny);
  for (const z of kam) z.jmeno = String(z.jmeno) + NALOZ;
  /* ZAHOZENÉ JMENOVITĚ. Jméno cizího hostu je text z cizího webu a
     jde do DETAILU řádku, tedy do innerHTML — proto v něm nálož je.
     A protože se vypisuje jen u SKOŘÁPEK, musí skořápka ve fixtuře
     opravdu být; kdyby nebyla, kontrola by na to místo nedosáhla a
     sabotáž „bez escapování" by prošla zeleně (viz §348). */
  const skorapka = (N.zdroje || []).find((z) => z.slibuje === 'skořápka');
  if (!skorapka) throw new Error('v nálezu sondy není skořápka — zahozené by neměly kde být vidět');
  skorapka.vykresleno = { url: 'https://www.skorapka.cz/', bylo: 'skořápka', je: 'skořápka',
    nepomohlo: true, zablokovano: 0, cizich: 8,
    cizinci: [{ co: 'api.skorapka.cz' + NALOZ, kolik: 5 }, { co: 'mereni.example.org', kolik: 3 }] };
});
const PODMINKY = fixtura('zdroje-podminky.json', (P) => {
  P.updated = '2026-11-03';
  if (!P.zdroje || !P.zdroje.length) throw new Error('data/zdroje-podminky.json je prázdný — není z čeho fixturu postavit');
  const z = P.zdroje[0];
  z.jmeno = String(z.jmeno) + NALOZ;
  z.proc = 'zákaz';
  /* Jeden cíl se přepíše na KANDIDÁTA: v souboru zrovna být nemusí,
     ale vykreslení té větve se měřit má. A dopíše se pasáž, ať je
     vidět, že se vypisuje to hlavní pro člověka. */
  const k = P.zdroje[1] || JSON.parse(JSON.stringify(z));
  k.jmeno = 'Vymyšlený kandidát';
  k.proc = 'slibný kandidát';
  k.verdikt = 'přečteno, ale nic o automatickém přístupu';
  k.stranky = [{ url: 'https://www.kand.cz/podminky', popis: 'Podmínky užití',
    stav: 'přečteno, nic o automatu', pasaze: [], zminky: 3 }];
  delete k.dokumenty;
  z.verdikt = 'přečteno (1 pasáží o automatickém přístupu)';
  z.stranky = [{ url: 'https://www.zak.cz/podminky', popis: 'Obchodní podmínky', stav: 'přečteno',
    pasaze: [{ slovo: 'robot', text: 'Je zakázáno používat robota k vytěžování obsahu.' }] }];
  z.stranky[0].cteno = 'ze serveru';
  z.stranky[0].vykresleno = { bylo: 300, je: 310, nepomohlo: true, zablokovano: 2, cizich: 0,
    zakazane: [{ co: '/api/podminky.json' + NALOZ, kolik: 2 }] };
  z.dokumenty = ['https://www.zak.cz/podminky.pdf'];
  P.zdroje = [z, k];
});

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const ctx = await prohlizec.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 },
  locale: 'cs-CZ', serviceWorkers: 'block' });
/* Podstrčí se JEN ty dva nálezy; všechno ostatní jde z místního
   serveru a cizí adresy se zahodí. */
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (!process.env.PK_BEZ_PODSTRCENI && /\/data\/zdroje-sonda\.json/.test(u.pathname)) {
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SONDA) });
  }
  if (!process.env.PK_BEZ_PODSTRCENI && /\/data\/zdroje-podminky\.json/.test(u.pathname)) {
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PODMINKY) });
  }
  /* ZA SUPABASE SE ODPOVÍDÁ, NE ZAHAZUJE. Diagnostika se jí ptá jako
     první a celý výpis visí v jednom řetězu slibů — zahozený dotaz
     ho zastaví a bloky sond se vůbec nevykreslí. Napoprvé přesně to
     se stalo: v okně stál jediný řádek „Nastavení načteno". */
  if (/\.supabase\.co$/.test(u.hostname)) {
    const telo = /\/auth\/v1\/settings/.test(u.pathname) ? '{}' : '[]';
    return r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/0' }, body: telo });
  }
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});

const page = await ctx.newPage();
/* VÝJIMKY SE SBÍRAJÍ. Celý výpis diagnostiky visí v jednom řetězu
   slibů: jedna výjimka ho zastaví a na stránce zůstane jen první
   řádek. Bez tohohle sběru by zkouška hlásila „blok se nevykreslil"
   a neřekla proč. */
const vyjimky = [];
page.on('pageerror', (e) => vyjimky.push(String((e && e.message) || e).slice(0, 200)));
/* A ODMÍTNUTÉ SLIBY. Právě ty tu rozhodují: výpis visí v řetězu
   `.then`, takže chyba uvnitř není výjimka, ale odmítnutý slib —
   stránka zmlkne a v konzoli není nic, co by Playwright hlásil jako
   pageerror. Napoprvé jsem kvůli tomu hledal vadu o dvě patra jinde. */
await page.addInitScript(() => {
  window.PK_ODMITNUTO = [];
  window.addEventListener('unhandledrejection', (e) => {
    try { window.PK_ODMITNUTO.push(String((e.reason && e.reason.message) || e.reason).slice(0, 200)); } catch (x) {}
  });
});
await page.goto(`${BASE}/diagnostika.html`, { waitUntil: 'load' });
/* ČEKÁ SE NA VYKRESLENÝ ŘÁDEK, NE NA TEXT STRÁNKY. A má to důvod,
   na který jsem sám naletěl: `document.body.textContent` obsahuje
   i ZDROJ vloženého skriptu, a ten v sobě tyhle nápisy má. Čekání
   proto skončilo okamžitě (ještě před dokreslením) a kontroly pak
   měřily zdrojový kód stránky, ne to, co z něj vzniklo — osm jich
   padalo na vadu, která nikde nebyla. Měří se tedy obsah #vysledky,
   a to po prvcích. */
const vykresleno = () => page.evaluate(() => [...document.querySelectorAll('#vysledky .name')]
  .some((e) => /Sonda podmínek měřila/.test(e.textContent || '')));
const doKdy = Date.now() + 25000;
while (Date.now() < doKdy && !(await vykresleno())) await new Promise((r) => setTimeout(r, 250));
const m = await page.evaluate(() => ({
  text: (document.getElementById('vysledky') || {}).textContent || '',
  html: document.getElementById('vysledky') ? document.getElementById('vysledky').innerHTML : '',
  prasklo: window.PK_PRASKLO === 1,
  obrazku: document.querySelectorAll('#vysledky img').length,
  odkazu: [...document.querySelectorAll('#vysledky a')].map((a) => a.getAttribute('href')),
  odmitnuto: window.PK_ODMITNUTO || [],
}));
await page.close();
await ctx.close();
await prohlizec.close();

pravda('diagnostika se vykreslí bez výjimky', vyjimky.length === 0, vyjimky.join(' | '));
pravda('a bez odmítnutého slibu (ten by ji zastavil mlčky)',
  (m.odmitnuto || []).length === 0, (m.odmitnuto || []).join(' | '));
pravda('nález sondy ZDROJŮ se na stránce vykreslí',
  /Sonda zdrojů měřila 2026-11-03/.test(m.text), m.text.slice(0, 200));
pravda('nález sondy PODMÍNEK se na stránce vykreslí',
  /Sonda podmínek měřila 2026-11-03/.test(m.text), m.text.slice(-300));
pravda('u zakázaného zdroje stojí otázka „smíme dál"',
  /Zákaz u /.test(m.text) && /smíme dál/.test(m.text), m.text.slice(-400));
pravda('u slibného kandidáta stojí otázka „smělo by se začít"',
  /Kandidát Vymyšlený kandidát/.test(m.text) && /smělo začít čist/.test(m.text), m.text.slice(-400));
pravda('vypíše se i naměřená pasáž o automatu (to hlavní pro člověka)',
  /vytěžování obsahu/.test(m.text), 'pasáže jsou U STRÁNEK, ne u zdroje — kdo je čte z jiného pole, nevypíše nic');
pravda('a odkaz na dokument, který musí otevřít člověk',
  /podminky\.pdf/.test(m.text), m.text.slice(-300));
pravda('čtené stránky jsou odkazy, na které jde kliknout',
  m.odkazu.some((h) => h === 'https://www.zak.cz/podminky'), JSON.stringify(m.odkazu).slice(0, 200));

pravda('zmínky, které o přístupu nejsou, se přiznají (a nepočítají)',
  /3 zmínek, které o přístupu k obsahu nejsou/.test(m.text),
  'bez toho vypadá „nic o automatu" jako že se nehledalo — naměřeno 9 takových zmínek na šesti webech');

/* ZAHOZENÉ JMENOVITĚ. Samo „8 cizích hostů" u ÚZSVM 3. 11. naostro
   neodpovědělo na nic. Měří se tedy, že se do diagnostiky dostane
   JMÉNO — jen podle něj majitel pozná, jestli šlo o měřidla, nebo
   o datové rozhraní na sousední doméně, tedy o druhou cestu. */
pravda('u skořápky je vidět, který cizí host si obsah tahal',
  /api\.skorapka\.cz/.test(m.text) && /mereni\.example\.org/.test(m.text)
  && /prohlížeč nepomohl/.test(m.text),
  m.text.replace(/\s+/g, ' ').slice(0, 300));
pravda('a u podmínek, kterou cestu robots.txt nedovolil',
  m.text.includes('/api/podminky.json'),
  m.text.replace(/\s+/g, ' ').slice(0, 300));

/* ESCAPOVÁNÍ: nálož z cizího jména se NESMÍ stát prvkem. */
pravda('nálož z cizího jména zdroje se nevykonala',
  m.prasklo === false && m.obrazku === 0,
  `prasklo=${m.prasklo}, obrázků=${m.obrazku} — jméno zdroje je text z cizího webu`);
/* JMÉNO SE VKLÁDÁ PŘES textContent, takže v innerHTML stojí jako
   escapovaná entita — a žádný prvek z něj nevznikne. Měří se obojí:
   že entita tam je (jméno se opravdu vypsalo) a že značka ne. */
pravda('a je vidět jako text, ne jako značka',
  m.html.includes('&lt;img') && !/<img/i.test(m.html),
  'entita: ' + m.html.includes('&lt;img') + ', značka: ' + /<img/i.test(m.html));

console.log('\nDiagnostika: nálezy sond se vykreslí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Diagnostika zdrojů: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
