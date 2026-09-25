// Funkční kontrola všech stránek webu.
//
// Spuštění: node scripts/test-stranky.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Dvě věci, které se jinak poznají až od návštěvníka:
//   1) MRTVÝ ODKAZ — kontroluje se staticky ve VŠECH souborech .html, tedy
//      i na osmdesáti krajských a okresních stránkách, které nikdo ručně
//      neprochází. Stačí přejmenovat soubor a odkaz spadne na 404.
//   2) CHYBA SKRIPTU — stránka se tváří, že je v pořádku, ale kus ovládání
//      nefunguje. Projde se proto vzorek stránek v opravdovém prohlížeči
//      a hlídá se, jestli něco spadne nebo se nenačte.
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let chyb = 0;
const zpravy = [];
function chyba(txt) { chyb++; zpravy.push('  ✕ ' + txt); }

/* ---------- 1. mrtvé odkazy ve všech .html ---------- */
const soubory = readdirSync('.').filter((f) => f.endsWith('.html'));
let odkazu = 0;
const chybi = new Map();
for (const f of soubory) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/href="([^"#?:]+\.html)(?:[#?][^"]*)?"/g)) {
    const cil = m[1];
    if (cil.startsWith('http') || cil.startsWith('//')) continue;
    odkazu++;
    if (!existsSync(path.join('.', cil))) {
      if (!chybi.has(cil)) chybi.set(cil, new Set());
      chybi.get(cil).add(f);
    }
  }
}
for (const [cil, kde] of chybi) chyba(`odkaz na „${cil}" nikam nevede — je na: ${[...kde].slice(0, 4).join(', ')}`);
zpravy.push(`  · prošlo se ${odkazu} odkazů ve ${soubory.length} souborech`);

/* ---------- 1b. patička: z každé stránky vede cesta dál ----------
   Čtyři stránky (hlídání, upozornění, zprávy, můj profil) měly patičku
   oříznutou na jediný řádek „© 2026 Parcelka" — bez odkazů na podmínky,
   ochranu údajů i kontakt. Zrovna tam přitom člověk zakládá účet
   a odesílá údaje, takže ty odkazy potřebuje nejvíc. Ven se odtud dalo
   jen přes menu v hlavičce. */
{
  const bezPaticky = new Set(['404.html', 'diagnostika.html', 'inzerce.html', 'predloha.html']);
  const chybi = [];
  let prohlednuto = 0;
  for (const f of soubory) {
    if (bezPaticky.has(f) || f.startsWith('pozemek-') || f.startsWith('pozemky-')) continue;
    const h = readFileSync(f, 'utf8');
    if (h.indexOf('<footer') === -1) continue;
    prohlednuto++;
    const pata = h.slice(h.indexOf('<footer'), h.indexOf('</footer>') + 9);
    const pravni = /ochrana-udaju\.html/.test(pata) && /podminky\.html/.test(pata) && /kontakt\.html/.test(pata);
    if (!pravni) chybi.push(f);
  }
  if (prohlednuto < 10) chyba(`patičku má jen ${prohlednuto} stránek — kontrola níž nic nehlídá`);
  if (chybi.length) chyba(`v patičce chybí odkazy na podmínky, ochranu údajů nebo kontakt: ${chybi.slice(0, 5).join(', ')}`);
  else zpravy.push(`  ✓ ze všech ${prohlednuto} stránek s patičkou vede cesta na podmínky, ochranu údajů i kontakt`);
}

/* ---------- 1c. pruh se záložkami účtu ----------
   Upozornění, zprávy, hlídání a profil jsou čtyři stránky jednoho účtu.
   Přejít mezi nimi šlo jen rozbalovací nabídkou „Moje" v hlavičce a nic
   neukazovalo, na které z nich člověk stojí. Pruh se záložkami musí být
   na všech čtyřech, vést na všechny čtyři a právě jedna záložka — ta
   vlastní — musí být označená jako otevřená. Kdyby se označení rozešlo
   se stránkou, ukazoval by pruh na špatné místo, což je horší než žádný. */
{
  const UCET = ['upozorneni.html', 'zpravy.html', 'hlidani.html', 'muj-inzerat.html'];
  const potize = [];
  for (const f of UCET) {
    const h = readFileSync(f, 'utf8');
    const i = h.indexOf('<nav class="uc-taby"');
    if (i === -1) { potize.push(`${f} nemá pruh se záložkami účtu`); continue; }
    const pruh = h.slice(i, h.indexOf('</nav>', i));
    const chybne = UCET.filter((c) => !new RegExp(`href="${c}"`).test(pruh));
    if (chybne.length) potize.push(`v záložkách na ${f} chybí odkaz na: ${chybne.join(', ')}`);
    const tady = [...pruh.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    if (tady.length !== 1) potize.push(`na ${f} je označeno ${tady.length} otevřených záložek, má být právě jedna`);
    else if (tady[0] !== f) potize.push(`na ${f} je jako otevřená označena záložka „${tady[0]}"`);
  }
  for (const t of potize) chyba(t);
  if (!potize.length) zpravy.push('  ✓ čtyři stránky účtu mají pruh se záložkami a vědí, na které z nich člověk stojí');
}

/* ---------- 1d. seznam okresů v 404.html ----------
   Dopisuje ho robot. Kdyby se rozešel se skutečnými stránkami okresů,
   posílala by stránka 404 lidi na další 404 — což je horší než nic. */
{
  const h = readFileSync('404.html', 'utf8');
  const m = /\/\*ZACATEK-OKRESY\*\/([\s\S]*?)\/\*KONEC-OKRESY\*\//.exec(h);
  if (!m) chyba('404.html nemá značky pro seznam okresů — robot ho nemá kam zapsat');
  else {
    let mapa = null;
    try { mapa = JSON.parse(m[1]); } catch (e) { chyba('seznam okresů v 404.html není platný JSON'); }
    if (mapa) {
      const znacky = Object.keys(mapa);
      if (znacky.length < 70) chyba(`404.html zná jen ${znacky.length} okresů — má jich být 77`);
      const mrtve = znacky.filter((z) => !existsSync(`pozemky-okres-${z}.html`));
      if (mrtve.length) chyba(`404.html odkazuje na okresy bez stránky: ${mrtve.slice(0, 4).join(', ')}`);
      else if (znacky.length >= 70) zpravy.push(`  ✓ všech ${znacky.length} okresů v 404.html má svou stránku`);
    }
  }
}

/* ---------- 2. stránky v prohlížeči ---------- */
// Vzorek: od každého druhu stránky jedna (všech 108 by běželo zbytečně dlouho).
/* Stránka pozemku se zkouší DVAKRÁT: prázdná (ukáže „nenalezeno") i s
   opravdovou nabídkou. Bez toho druhého se kontroluje jen chybový stav —
   a třeba pravidlo o mezinadpisech se na krátké hlášce nikdy neuplatní.
   Přišlo se na to sabotáží: nadpisy se z detailu odebraly a test mlčel. */
function sPozemkem() {
  try {
    const d = (JSON.parse(readFileSync('data/opportunities.json', 'utf8')).opportunities || [])
      .find((x) => typeof x.lat === 'number' && typeof x.lng === 'number' && x.price > 0);
    if (!d) return null;
    const klic = [d.place || '', d.parcel || '', d.okres || '', d.lat.toFixed(3), d.lng.toFixed(3)].join('|');
    return `pozemek.html?p=${encodeURIComponent(klic)}&ll=${d.lat},${d.lng}`;
  } catch (e) { return null; }
}

const VZOREK = ['index.html', 'pozemek.html', sPozemkem(), 'pridat.html', 'hlidani.html', 'zpravy.html',
  'upozorneni.html', 'muj-inzerat.html', 'kontakt.html', 'cena-pozemku.html',
  'podminky.html', 'ochrana-udaju.html', 'pozemky-podle-okresu.html',
  'pozemky-stredocesky-kraj.html', 'pozemky-okres-kolin.html', '404.html']
  .filter(Boolean)
  .filter((f) => existsSync(f.split('?')[0]));

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const s of VZOREK) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/${s.split('?')[0]}*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  const padlo = [];
  const nenacetlo = [];
  p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 160)));
  p.on('response', (r) => {
    const u = new URL(r.url());
    // Zajímají jen NAŠE soubory; cizí (písma, dlaždice) sem netahám.
    if (u.hostname !== '127.0.0.1') return;
    // Falešná Supabase v testu odpovídá na dotazy do databáze po svém —
    // hlídáme jen SOUBORY webu, ne odpovědi rozhraní.
    if (/^\/(rest|auth|storage)\//.test(u.pathname)) return;
    if (r.status() >= 400) nenacetlo.push(r.status() + ' ' + u.pathname);
  });
  // Stránka pozemku bez parametru ukáže „nenalezeno"; oba stavy musí obstát,
  // proto se zkouší v tom, do kterého se dostane běžný návštěvník.
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1800);

  const hlava = await p.evaluate(() => ({
    titul: (document.title || '').trim(),
    popis: (document.querySelector('meta[name="description"]') || {}).content || '',
    h1: document.querySelectorAll('h1').length,
    h2: document.querySelectorAll('h2, h3').length,
    delka: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
    lang: document.documentElement.getAttribute('lang') || '',
  }));

  if (padlo.length) chyba(`${s}: skript spadl — ${padlo[0]}`);
  if (nenacetlo.length) chyba(`${s}: nenačetlo se ${[...new Set(nenacetlo)].slice(0, 3).join(', ')}`);
  if (!hlava.titul) chyba(`${s}: chybí titulek stránky`);
  if (!hlava.popis) chyba(`${s}: chybí popis (meta description) — bez něj si Google vymyslí vlastní`);
  if (hlava.h1 !== 1) chyba(`${s}: hlavních nadpisů (h1) je ${hlava.h1}, má být právě jeden`);
  /* Dlouhá stránka bez mezinadpisů je pro odečítač obrazovky jeden blok
     textu, kterým se nedá skákat. Stránka pozemku takhle dlouho vypadala:
     jediný nadpis byl ten hlavní, „Parametry pozemku" i „Co byste měli
     vědět" byly obyčejné divy, které jen vypadaly jako nadpisy.
     Hranice je úsudek: pod patnácti sty znaky je stránka krátká na to,
     aby se v ní někdo ztratil (404, přesměrování). */
  if (hlava.delka > 1500 && hlava.h2 === 0) {
    chyba(`${s}: ${hlava.delka} znaků textu a ani jeden mezinadpis (h2/h3) — odečítačem se v tom nedá pohybovat`);
  }
  if (hlava.lang !== 'cs') chyba(`${s}: chybí nebo nesedí jazyk stránky (lang="${hlava.lang}")`);

  /* SMÍM TU STAVĚT? U pozemku není dražší otázka — a web na ni dlouho
     neodpovídal vůbec: v detailu nebyla o územním plánu ani zmínka, natož
     odkaz, takže se muselo odcházet a hledat od nuly. Odpovědět za obec
     Parcelka nemůže (celostátní vrstva územních plánů neexistuje, vydává
     je každá ORP zvlášť), ale odchod musí zkrátit na jedno klepnutí —
     a s obcí v dotazu, ne naprázdno.
     Odkaz se přestěhoval z řady tlačítek pod mapu s vrstvami, kam patří
     obsahem: mapa umí plán ukázat jako vrstvu, a když ho úřední služba
     nedá, tahle věta je náhradní cesta. Proto se hledá i v „.pzm-pod". */
  if (s.startsWith('pozemek.html?p=')) {
    const plan = await p.evaluate(() => {
      const a2 = [...document.querySelectorAll('.pz-actions a, .pz-cta a, .pzm-pod a')]
        .find((e) => /územní plán/i.test(e.textContent || ''));
      const obec = (document.querySelector('.pz-place') || {}).textContent || '';
      return a2 ? { href: a2.getAttribute('href') || '', obec: obec.trim() } : null;
    });
    if (!plan) chyba(`${s}: z detailu pozemku nevede žádná cesta k územnímu plánu`);
    else if (!plan.obec || !decodeURIComponent(plan.href).includes(plan.obec)) {
      chyba(`${s}: odkaz na územní plán nenese obec „${plan.obec}" (${plan.href.slice(0, 80)})`);
    }
  }
  if (!padlo.length && !nenacetlo.length) zpravy.push(`  ✓ ${s}`);
  await ctx.close();
}

/* ---------- 3. odkaz na pozemek, který už není v nabídce ----------
   Tohle je nejčastější 404 na webu: nabídky mizí (pozemek se prodá,
   inzerát vyprší) a jeho stránka se smaže, jenže odkaz na ni si lidé
   uložili nebo poslali dál. Stránka jim musí říct, co se stalo, a
   nabídnout jejich okres — ne skočit sama na mapu, dřív než to stihnou
   přečíst. Zkouší se přes opravdovou adresu smazaného pozemku, protože
   celé chování stojí na tom, co je v adrese. */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 140)));

  /* Obec schválně vymyšlená, ať adresu nikdy nezabere skutečný pozemek.
     Okres je pravý, a to dvojznačný: „praha" i „praha-vychod" na začátek
     sedí, takže se tím zároveň zkouší, že vyhraje delší shoda. */
  const ADRESA = 'pozemek-praha-vychod-tato-obec-neexistuje-zzzzz1.html';
  if (existsSync(ADRESA)) chyba(`test počítá s tím, že ${ADRESA} neexistuje`);
  const odpoved = await p.goto(`${BASE}/${ADRESA}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(400);
  if (!odpoved || odpoved.status() !== 404) chyba(`neznámá adresa nevrátila stav 404 (${odpoved && odpoved.status()})`);

  const predtim = chyb;
  const v = await p.evaluate(() => ({
    nadpis: (document.getElementById('nadpis') || {}).textContent || '',
    popis: (document.getElementById('popis') || {}).textContent || '',
    okres: (() => { const a = document.getElementById('okres-link');
      return a && !a.hidden ? { href: a.getAttribute('href'), text: a.textContent } : null; })(),
  }));
  /* Bez \b kolem slov: „ž" ani „í" nejsou v JS pro \b písmena, takže
     /\buž\b/ by nesedlo ani na větu, která tam je. */
  if (!/už[^.!?]*není/i.test(v.nadpis)) chyba(`404 u smazaného pozemku hlásí „${v.nadpis}" — má říct, že pozemek už není v nabídce`);
  if (!v.okres) chyba('404 u smazaného pozemku nenabídla odkaz na okres');
  else {
    const cil = v.okres.href.replace(/^\//, '');
    if (!existsSync(cil)) chyba(`404 posílá na „${cil}", ale ta stránka neexistuje`);
    if (!/Praha-východ/i.test(v.okres.text)) chyba(`404 nabízí okres „${v.okres.text}", čekalo se Praha-východ`);
  }

  /* Samovolné přesměrování: dřív stránka po 2,5 s skočila na mapu. Kdo
     nečte rychle, nedozvěděl se nic. Adresa tedy musí po chvíli zůstat
     tam, kde byla. */
  await p.waitForTimeout(3200);
  if (!p.url().endsWith(ADRESA)) chyba(`404 se sama přesměrovala na ${p.url()} — člověk si to má rozmyslet sám`);

  if (padlo.length) chyba(`na stránce 404 spadl skript: ${padlo[0]}`);
  // ✓ jen když v CELÉM tomhle oddílu nic neselhalo — jinak by vedle
  // vypsané chyby stálo „v pořádku" a člověk by četl obojí.
  if (chyb === predtim) zpravy.push('  ✓ odkaz na prodaný pozemek řekne, co se stalo, a nabídne jeho okres');
  await ctx.close();
}

await prohlizec.close();
console.log('\nFunkční kontrola stránek');
console.log(zpravy.join('\n'));
console.log(chyb ? `\n${chyb} chyb` : '\nVšechny stránky se načetly a odkazy vedou tam, kam mají.');
if (chyb) console.log('::error::Funkční kontrola stránek našla chyby.');
process.exit(chyb ? 1 : 0);
