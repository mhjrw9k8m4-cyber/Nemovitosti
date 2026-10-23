/* Test: CSP na stránkách opravdu platí — a zastaví podstrčený skript.
   ==================================================================
   Spuštění: node scripts/test-csp.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Co se hlídá ve třech vrstvách:

   1. STATICKY: každá stránka hlavičku nese a politika je ta přísná
      (script-src bez 'unsafe-inline' a bez 'unsafe-eval', object-src
      a base-uri na 'none'). Hashe se nepočítají znovu, ale berou ze
      scripts/csp.mjs — ať se zkouška a generátor nemohou rozejít.

   2. V PROHLÍŽEČI: na jedenácti typech stránek nesmí padnout ani jedno
      porušení (securitypolicyviolation) a stránka se musí vykreslit.
      Druhá podmínka je tam schválně: politika, která zakáže vlastní
      skripty stránky, by jinak prošla jako „bez porušení" nad mrtvou
      stránkou. Proto se měří i počet uzlů v DOM a hlásí se chyba
      skriptu (pageerror).

   3. SABOTÁŽÍ, A TO V OBOU SMĚRECH. Server umí stránku na požádání
      „napadnout": vloží do ní vložený skript a odkaz na cizí skript.
      · se hlavičkou  → podstrčený skript se NESMÍ spustit a porušení
        se musí ohlásit;
      · bez hlavičky  → podstrčený skript se spustit MUSÍ.
      Ten druhý směr je důležitý: bez něj by „zablokováno" mohlo
      znamenat jen to, že se podstrčení nepovedlo, a zkouška by
      prošla, i kdyby CSP nedělala nic.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashe, stranky, politika, potrebujeEval } from './csp.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8312;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('CSP', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1. STATICKY ------------------------------------------------- */
const META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;
const vsechny = stranky();
let bez = [], slabe = [], neuplne = [], sEvalem = [], evalBezDuvodu = [], evalChybi = [];
for (const f of vsechny) {
  const s = readFileSync(path.join(KOREN, f), 'utf8');
  const m = s.match(META);
  if (!m) { bez.push(f); continue; }
  const p = m[1];
  if (/script-src[^;]*'unsafe-inline'/.test(p)) slabe.push(f);
  if (!/object-src 'none'/.test(p) || !/base-uri 'none'/.test(p)) slabe.push(f);
  /* 'unsafe-eval' smí nést jen stránka, která si může načíst model na
     kontrolu fotek — a jen podle pravidla, ne podle seznamu. Hlídá se
     to v OBOU směrech: povolení bez důvodu i chybějící povolení tam,
     kde bez něj kontrola fotek nepoběží. */
  const maEval = /script-src[^;]*'unsafe-eval'/.test(p);
  const smiEval = potrebujeEval(s);
  if (maEval) sEvalem.push(f);
  if (maEval && !smiEval) evalBezDuvodu.push(f);
  if (!maEval && smiEval) evalChybi.push(f);
  /* Každý hash, který stránka potřebuje, v politice je. */
  for (const h of hashe(s)) if (p.indexOf(h) < 0) { neuplne.push(`${f} (${h.slice(0, 20)}…)`); break; }
}
pravda(`je co měřit — stránek je ${vsechny.length}`, vsechny.length > 100, `našlo se ${vsechny.length}`);
pravda('hlavičku CSP nese každá stránka', bez.length === 0, bez.length ? `bez ní: ${bez.slice(0, 3).join(', ')} (celkem ${bez.length})` : '');
pravda('politika je přísná (skripty bez unsafe-inline, object-src a base-uri na none)',
  slabe.length === 0, slabe.length ? `povolná na: ${slabe.slice(0, 3).join(', ')}` : '');
pravda(`'unsafe-eval' nese jen stránka s kontrolou fotek (${sEvalem.length} z ${vsechny.length})`,
  evalBezDuvodu.length === 0 && evalChybi.length === 0,
  `bez důvodu: ${evalBezDuvodu.slice(0, 3).join(', ') || 'nic'} · chybí: ${evalChybi.slice(0, 3).join(', ') || 'nic'}`);
pravda('a takových stránek je málo (výjimka nemá tiše roztéct po webu)',
  sEvalem.length <= 3, `je jich ${sEvalem.length}: ${sEvalem.slice(0, 5).join(', ')}`);
/* Výjimka se dá zneužít jen tehdy, když si náš vlastní skript pouští
   text jako kód. V js/ (to, co běží v prohlížeči) se to nedělá —
   a tohle to hlídá. Krokům sestavení v scripts/ se to nezakazuje:
   generate-parcel-pages.mjs si tak načítá js/ceny.js, aby počítal
   týmiž čísly jako web, a do prohlížeče se nic z toho nedostane. */
const sEvalemVKodu = [];
for (const f of readdirSync(path.join(KOREN, 'js'))) {
  if (!/\.js$/.test(f)) continue;
  const t = readFileSync(path.join(KOREN, 'js', f), 'utf8');
  if (/(^|[^.\w])eval\s*\(|new Function\s*\(/.test(t)) sEvalemVKodu.push(f);
}
pravda('žádný skript v js/ si nepouští text jako kód (eval, new Function)',
  sEvalemVKodu.length === 0, sEvalemVKodu.slice(0, 3).join(', '));
pravda('každý vložený skript stránky má svůj hash v politice',
  neuplne.length === 0, neuplne.length ? `chybí u: ${neuplne.slice(0, 3).join(', ')} (celkem ${neuplne.length})` : '');
/* Politika se skládá z naměřených původů; kdyby odtud vypadl Supabase,
   přihlášení přestane fungovat a nikdo si toho nemusí všimnout. */
const vzorovaPolitika = politika([]);
for (const musi of ['connect-src', 'supabase.co', 'tile.openstreetmap.org', 'server.arcgisonline.com', 'nominatim.openstreetmap.org']) {
  pravda(`politika zná „${musi}"`, vzorovaPolitika.indexOf(musi) >= 0);
}
/* TŘETÍ SEZNAM TÉHOŽ VĚCI. Cizí servery, ze kterých si stránka něco
   stahuje, už jsou dvakrát: v zásadách soukromí (hlídá
   test-cizi-servery.mjs) a teď i v politice. Dvě kopie se rozějdou,
   tři tím spíš — proto se tady porovnávají: co politika pouští, musí
   být jmenováno v ochrana-udaju.html, jinak ten dokument nemluví
   pravdu o tom, komu se IP adresa návštěvníka může dostat. */
const zasady = readFileSync(path.join(KOREN, 'ochrana-udaju.html'), 'utf8');
const ciziVPolitice = [...new Set((vzorovaPolitika.match(/https:\/\/[a-z0-9.-]+/g) || [])
  .map((u) => u.replace('https://', '')))];
const nenapsane = ciziVPolitice.filter((h) => zasady.indexOf(h.replace(/^[abc]\./, '')) < 0);
pravda(`každý cizí server z politiky je jmenovaný v zásadách soukromí (${ciziVPolitice.length})`,
  nenapsane.length === 0, `chybí v ochrana-udaju.html: ${nenapsane.join(', ')}`);

/* OSTATNÍ ZKOUŠKY V PROHLÍŽEČI MUSÍ CSP OBCHÁZET — a tahle ne.
   Naměřeno 23. 10., když politika přišla na web: 30 zkoušek v prohlížeči
   spadlo a vypadalo to na rozbitý web. Nebyl: Playwright ovládá stránku
   vstřikovaným kódem a ten si volá eval, takže pod přísným script-src
   přestane fungovat scrollování k prvku i waitForFunction. V hlášce
   o porušení nebyl žádný zdrojový soubor — proto to vypadalo na
   stránku. Na tohle má Playwright volbu bypassCSP: zkouška pak ovládá
   stránku, jako by hlavička nebyla, a jestli hlavička platí, měří
   TAHLE zkouška — ta ji naopak obcházet nesmí, jinak by neměřila nic. */
{
  /* Zkouška v prohlížeči se pozná podle toho, že si bere playwright —
     ne podle slova „newContext" v textu: test-zkousky-meri.mjs si ho
     nese ve vzoru, kterým rozebírá ostatní zkoušky, a prohlížeč
     nespouští. */
  const bez = [], mojeVolani = [];
  for (const f of readdirSync(path.join(KOREN, 'scripts'))) {
    if (!/^test-.*\.mjs$/.test(f)) continue;
    const t = readFileSync(path.join(KOREN, 'scripts', f), 'utf8');
    if (t.indexOf("from 'playwright-core'") < 0) continue;
    const volani = t.match(/\.newContext\([\s\S]{0,200}/g) || [];
    if (f === 'test-csp.mjs') { mojeVolani.push(...volani); continue; }
    if (volani.length && !volani.every((v) => /bypassCSP/.test(v)) && t.indexOf('bypassCSP') < 0) bez.push(f);
  }
  pravda('každá ostatní zkouška v prohlížeči si CSP obchází (bypassCSP)',
    bez.length === 0, bez.length ? `bez něj: ${bez.slice(0, 4).join(', ')} (celkem ${bez.length})` : '');
  pravda(`a tahle zkouška ho naopak nemá (jinak by neměřila nic) — ${mojeVolani.length} vlastní volání`,
    mojeVolani.length > 0 && mojeVolani.every((v) => !/bypassCSP/.test(v)));
}

/* ---- server, který umí stránku na požádání napadnout -------------- */
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
/* Podstrčení: přesně to, co by udělala dírka v escapování — vložený
   skript ve stránce a odkaz na skript z cizího serveru. */
const PODSTRCENE = '<script>window.__PODSTRCENO = 1;</script>'
  + '<script src="https://priklad.invalid/zly.js"></script>';
const server = createServer((q, s) => {
  const [cesta, dotaz] = (q.url || '/').split('?');
  const u = decodeURIComponent(cesta);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end('ne'); }
  let telo = readFileSync(f);
  const parametry = new URLSearchParams(dotaz || '');
  if (parametry.has('bezeval')) {
    telo = Buffer.from(telo.toString('utf8').replace(" 'unsafe-eval'", ''), 'utf8');
  }
  if (parametry.has('podstrc')) {
    let html = telo.toString('utf8');
    if (parametry.has('bezcsp')) html = html.replace(META, '');
    html = html.replace('</body>', PODSTRCENE + '</body>');
    telo = Buffer.from(html, 'utf8');
  }
  s.setHeader('content-type', TYPY[path.extname(f)] || 'application/octet-stream');
  s.end(telo);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/* ---- 2. V PROHLÍŽEČI --------------------------------------------- */
/* Od každého druhu stránky jedna. Nejmenší počet uzlů v DOM je
   naměřený 23. 10. a sražený dolů (pojistka proti měření nad mrtvou
   stránkou, ne kontrola rozvržení). */
const NEJMENE = {
  'index.html': 1500, 'pozemky-okres-benesov.html': 500, 'zpravy.html': 80,
  'muj-inzerat.html': 200, 'data.html': 250, 'pridat.html': 350,
  'hlidani.html': 100, 'porovnani.html': 110, 'cena-pozemku.html': 400,
  'moje-data.html': 110,
};
const STRANKY = Object.keys(NEJMENE);
/* Stránka pozemku se bere skutečná — ta má vložený datový blok
   window.PK_POZEMEK, tedy právě ten skript, který musí hash pustit. */
const pozemky = vsechny.filter((f) => /^pozemek-.*\.html$/.test(f));
if (pozemky.length) { STRANKY.push(pozemky[0]); NEJMENE[pozemky[0]] = 250; }

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__CSP = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__CSP.push(String(e.violatedDirective) + ' ← ' + String(e.blockedURI || 'inline'));
    });
  });
  const p = await ctx.newPage();
  const chybySkriptu = [];
  p.on('pageerror', (e) => chybySkriptu.push(String(e).slice(0, 90)));

  let porusujici = [], mrtve = [];
  for (const s of STRANKY) {
    chybySkriptu.length = 0;
    await p.goto(`http://127.0.0.1:${PORT}/${s}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({ csp: window.__CSP || [], uzlu: document.querySelectorAll('*').length }));
    if (r.csp.length) porusujici.push(`${s}: ${r.csp.slice(0, 2).join(' ; ')}`);
    if (r.uzlu < NEJMENE[s]) mrtve.push(`${s}: ${r.uzlu} uzlů < ${NEJMENE[s]}`);
    if (chybySkriptu.length) mrtve.push(`${s}: chyba skriptu — ${chybySkriptu[0]}`);
  }
  pravda(`žádná z ${STRANKY.length} stránek nehlásí porušení CSP`, porusujici.length === 0,
    porusujici.slice(0, 3).join(' | '));
  pravda('a všechny se přitom vykreslily (politika nezakázala vlastní skripty)',
    mrtve.length === 0, mrtve.slice(0, 3).join(' | '));

  /* ---- KONTROLA FOTEK: BĚŽÍ POD TOUHLE POLITIKOU? ---------------- */
  /* Tahle jediná cesta na webu potřebuje 'unsafe-eval' (vendor/tfjs).
     Měří se, že s výjimkou projde A že bez ní padne — jinak by v
     politice zůstalo povolení, o kterém nikdo neví, jestli je k čemu. */
  async function fotkaProjde(adresa) {
    await p.goto(adresa, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    const v = await p.evaluate(async () => {
      const nacti = (u) => new Promise((hotovo, zle) => {
        const e = document.createElement('script');
        e.src = u; e.onload = hotovo; e.onerror = () => zle(new Error('nenačteno ' + u));
        document.head.appendChild(e);
      });
      try {
        if (!window.tf) await nacti('vendor/tfjs/tf.min.js');
        if (!window.nsfwjs) await nacti('vendor/nsfwjs/nsfwjs.min.js');
        await window.tf.ready();
        const model = await window.nsfwjs.load('assets/nsfw-model/', { size: 224 });
        const c = document.createElement('canvas'); c.width = 224; c.height = 224;
        const g = c.getContext('2d'); g.fillStyle = '#8a6'; g.fillRect(0, 0, 224, 224);
        const odhad = await model.classify(c);
        return { prosla: !!(odhad && odhad[0] && odhad[0].className), chyba: null };
      } catch (e) { return { prosla: false, chyba: String(e).slice(0, 90) }; }
    });
    const csp = await p.evaluate(() => window.__CSP || []);
    return { ...v, csp };
  }
  const sVyjimkou = await fotkaProjde(`http://127.0.0.1:${PORT}/pridat.html`);
  pravda('kontrola fotek AI modelem pod politikou projde (pridat.html)',
    sVyjimkou.prosla === true && sVyjimkou.csp.length === 0,
    `chyba: ${sVyjimkou.chyba || '—'} · porušení: ${sVyjimkou.csp.slice(0, 2).join(' ; ') || 'žádné'}`);
  const bezVyjimky = await fotkaProjde(`http://127.0.0.1:${PORT}/pridat.html?bezeval=1`);
  pravda("a bez 'unsafe-eval' naopak NEPROJDE (výjimka tedy není zbytečná)",
    bezVyjimky.prosla === false && bezVyjimky.csp.some((x) => /script-src/.test(x)),
    `prošla: ${bezVyjimky.prosla} · porušení: ${bezVyjimky.csp.slice(0, 2).join(' ; ') || 'žádné'}`);

  /* ---- 3. SABOTÁŽ, OBA SMĚRY ------------------------------------- */
  await p.goto(`http://127.0.0.1:${PORT}/index.html?podstrc=1&bezcsp=1`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const bezCsp = await p.evaluate(() => ({ podstrceno: !!window.__PODSTRCENO, csp: (window.__CSP || []).length }));
  pravda('kontrola samotného podstrčení: BEZ hlavičky se cizí skript spustí',
    bezCsp.podstrceno === true, `__PODSTRCENO=${bezCsp.podstrceno} (kdyby ne, neměřila by se CSP, ale chyba vkládání)`);

  await p.goto(`http://127.0.0.1:${PORT}/index.html?podstrc=1`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const sCsp = await p.evaluate(() => ({ podstrceno: !!window.__PODSTRCENO, csp: window.__CSP || [] }));
  pravda('S hlavičkou se podstrčený vložený skript NESPUSTÍ',
    sCsp.podstrceno === false, `__PODSTRCENO=${sCsp.podstrceno}`);
  pravda('a prohlížeč to ohlásí jako porušení script-src',
    sCsp.csp.some((x) => /script-src/.test(x)), `hlášeno: ${sCsp.csp.slice(0, 3).join(' ; ') || '(nic)'}`);
  pravda('zablokuje se i cizí skript z jiného serveru',
    sCsp.csp.some((x) => /priklad\.invalid/.test(x)), `hlášeno: ${sCsp.csp.slice(0, 3).join(' ; ') || '(nic)'}`);

  await ctx.close();
} finally {
  await prohlizec.close();
  server.close();
}

console.log('\nCSP: hlavička, přísnost a sabotáž');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::CSP: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
