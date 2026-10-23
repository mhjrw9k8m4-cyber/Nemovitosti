/* Test: stránky, kde klepnutí mění účet nebo uložená data, se nesmí
 * ukázat v cizím rámu.
 * ====================================================================
 * Spuštění: node scripts/test-ramovani.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)
 *
 * PROČ. Útok se jmenuje clickjacking: cizí stránka vloží náš web do
 * průhledného rámu, nad něj položí vlastní návnadu a klepnutí, které
 * člověk míní na ni, dopadne na naše tlačítko. Na webu, kde se dá
 * smazat inzerát, odhlásit se, zrušit hlídání nebo vymazat všechna
 * uložená data, je to opravdový úkon za cizí ruku.
 *
 * SPRÁVNÁ OBRANA JE HLAVIČKA (X-Frame-Options nebo frame-ancestors
 * v CSP) — tu ale GitHub Pages nepošle a <meta> ji ignoruje; je to
 * zapsané v docs/pred-vydanim.md jako volitelný bod 6. Zbývá pojistka
 * v prohlížeči: stránka se v rámu nejdřív SKRYJE a pak se z rámu zkusí
 * vyskočit.
 *
 * CO Z TOHO DOOPRAVDY FUNGUJE, se změřilo, ne odhadlo: Chromium 1194
 * vyskočení z cizího rámu bez gesta uživatele ZAKÁŽE („Unsafe attempt
 * to initiate navigation… nor has it received a user gesture"), takže
 * v běžném rámu chrání to skrytí a adresa nahoře zůstane útočníkova.
 * Proto je skrytí první a proto tahle zkouška uznává OBĚ podoby
 * ochrany — kdyby uznávala jen vyskočení, prošla by jen náhodou.
 *
 * CO SE MĚŘÍ. Cizí původ se napodobí druhým portem (jiný port = jiný
 * původ), ten vloží naši stránku do rámu a zkouška se ptá:
 *   A) vyskočila stránka z rámu (adresa nahoře je naše), NEBO
 *   B) zůstal rám prázdný (nic se v něm nevykreslilo)?
 * Platí jedno z toho — obojí znamená, že návnadu nad naším tlačítkem
 * nejde postavit. A u sandboxovaného rámu, kde vyskočit nelze, se měří
 * právě ta druhá možnost.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAS = 8411, CIZI = 8412;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Rámování', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Stránky, kde klepnutí mění účet nebo uložená data. Seznam je tu
   napsaný schválně a ne odvozený: kdyby se bral z kódu, zkouška by
   schválila i to, že se někde pojistka ztratí. */
const CHRANENE = ['hlidani.html', 'muj-inzerat.html', 'pridat.html', 'zpravy.html', 'moje-data.html'];

const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const nas = createServer((req, res) => {
  const cesta = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
  try {
    const telo = readFileSync(path.join(KOREN, cesta));
    res.writeHead(200, { 'Content-Type': TYPY[path.extname(cesta)] || 'application/octet-stream' });
    res.end(telo);
  } catch (e) { res.writeHead(404); res.end('nic'); }
});
const cizi = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cil = u.searchParams.get('cil') || 'index.html';
  const sandbox = u.searchParams.get('sandbox') ? ' sandbox="allow-scripts"' : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>návnada</title>
    <iframe id="ram"${sandbox} src="http://127.0.0.1:${NAS}/${cil}"
      style="width:900px;height:600px;border:0"></iframe>`);
});
await new Promise((r) => nas.listen(NAS, '127.0.0.1', r));
await new Promise((r) => cizi.listen(CIZI, '127.0.0.1', r));

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  PW ? { executablePath: PW } : {}));

/** Zkusí vložit stránku do cizího rámu. Vrací, co se stalo. */
async function vRamu(cil, sandbox) {
  const ctx = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${CIZI}/?cil=${cil}${sandbox ? '&sandbox=1' : ''}`,
    { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const naseAdresa = p.url().indexOf(`127.0.0.1:${NAS}`) >= 0;
  let vidnoVRamu = null;
  if (!naseAdresa) {
    /* DO CIZÍHO RÁMU SE Z JAVASCRIPTU STRÁNKY NEVIDÍ — a je to tak
       správně (jiný port = jiný původ). Nejdřív jsem to zkusil přes
       `iframe.contentDocument` a všechno vyšlo „null", tedy nic
       naměřeno. Playwright ale na rámy vidí sám: `page.frames()` dá
       objekt rámu a v něm se dá vyhodnotit kód bez ohledu na původ. */
    const ram = p.frames().find((f) => f.url().indexOf(`127.0.0.1:${NAS}`) >= 0);
    if (ram) {
      try {
        vidnoVRamu = await ram.evaluate(() => {
          const s = getComputedStyle(document.documentElement);
          const v = document.body ? document.body.getBoundingClientRect().height : 0;
          return s.display !== 'none' && s.visibility !== 'hidden' && v > 0;
        });
      } catch (e) { vidnoVRamu = null; }
    } else {
      vidnoVRamu = false;         /* rám se vůbec nenačetl = prázdno */
    }
  }
  await ctx.close();
  return { naseAdresa, vidnoVRamu };
}

for (const cil of CHRANENE) {
  const v = await vRamu(cil, false);
  pravda(`${cil}: v cizím rámu nezůstane (vyskočí, nebo je prázdná)`,
    v.naseAdresa || v.vidnoVRamu === false,
    `adresa nahoře je naše: ${v.naseAdresa}, v rámu se něco vykreslilo: ${v.vidnoVRamu}`);
}

/* SANDBOXOVANÝ RÁM: vyskočit nejde, takže musí platit ta druhá
   polovina — prázdno. Bez téhle kontroly by stačilo vyskakování
   a pojistka by v sandboxu neplatila nic. */
{
  const v = await vRamu('muj-inzerat.html', true);
  pravda('a v rámu se sandboxem (vyskočit nelze) zůstane prázdno',
    v.vidnoVRamu === false,
    `v rámu se něco vykreslilo: ${v.vidnoVRamu} (adresa nahoře naše: ${v.naseAdresa})`);
}

/* JE CO MĚŘIT: stránka bez pojistky se v rámu vykreslí. Bez tohohle by
   zkouška prošla i tehdy, kdyby rám nefungoval vůbec. */
{
  const bezPojistky = readdirSync(KOREN).filter((f) => f.endsWith('.html')
    && !CHRANENE.includes(f)
    && !/window\.top!==window\.self/.test(readFileSync(path.join(KOREN, f), 'utf8')))[0];
  pravda('našla se stránka bez pojistky, na které jde měření ověřit', !!bezPojistky,
    'všechny stránky mají pojistku — pak tahle kontrola nic neváží');
  if (bezPojistky) {
    const v = await vRamu(bezPojistky, false);
    pravda(`a ta se v rámu opravdu vykreslí (${bezPojistky})`,
      v.naseAdresa === false && v.vidnoVRamu === true,
      `adresa nahoře naše: ${v.naseAdresa}, v rámu vykresleno: ${v.vidnoVRamu}`);
  }
}

await browser.close();
nas.close(); cizi.close();
console.log('\nRámování cizí stránkou (clickjacking)');
console.log(zpravy.join('\n'));
console.log(`\n  · chráněné stránky: ${CHRANENE.join(', ')}`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Rámování: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
