// Otevřená karta se musí dozvědět, že je na webu nová verze.
//
// Spuštění: node scripts/test-nova-verze.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. 30. 10. poslal majitel čtyřikrát za
// dopoledne snímek něčeho, co už bylo opravené a nasazené. Nasazení
// verze skončilo v 10:25:40, jeho snímek téže stránky je z 10:32 a je
// na něm verze předchozí. Příčiny byly dvě a obě jsou tu změřené:
//
//   1. UKLÁDÁNÍ V PROHLÍŽEČI. Web jede na GitHub Pages, ten posílá na
//      HTML svoje Cache-Control s platností v řádu minut a vlastní
//      hlavičky nastavit neumí. Pravidlo „navigace nejdřív ze sítě"
//      v sw.js tím bylo jen na papíře: fetch() prochází úložištěm
//      prohlížeče, a dokud je uložená odpověď čerstvá, na server se
//      nejde vůbec.
//   2. OTEVŘENÁ KARTA. Kdo stránku OTEVŘENOU má a jen se k ní vrátí
//      z jiné aplikace, žádné nové načtení nedělá — a prohlížeč se po
//      sw.js sám ptá při navigaci a zhruba jednou za den.
//
// Zkouší se obojí naostro, proti vlastnímu serveru, který posílá
// TUTÉŽ hlavičku jako GitHub Pages. „Nasazení" se vyrobí tak, že se
// pod běžící kartou změní, co server vydává.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hlasPad } from './zkouska-pad.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chyb = 0;
const zpravy = [];
hlasPad('Nová verze v otevřené kartě', zpravy);
function pravda(popis, podm, detail) {
  if (podm) { zpravy.push('  ✓ ' + popis); return true; }
  chyb++; zpravy.push('  ✕ ' + popis + (detail ? ' — ' + detail : ''));
  return false;
}

/* Vlastní server: jde přesně o hlavičky, takže ten obvyklý statický
   server nestačí. Port je jiný než sdílená 8310 (scripts/port-zkousky.mjs),
   aby tahle zkouška mohla běžet i vedle ostatních. */
const PORT = 8399;
let VERZE = 'STARA';
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cesta = u.pathname === '/' ? '/index.html' : u.pathname;
  const f = path.join(KOREN, decodeURIComponent(cesta));
  if (!f.startsWith(KOREN) || !existsSync(f)) { res.writeHead(404).end('ne'); return; }
  let telo = readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') {
    /* Značka verze ve stránce: podle ní se pozná, co karta drží. */
    telo = Buffer.from(String(telo).replace('</body>', `<i id="zk-verze" hidden>${VERZE}</i></body>`));
    /* TOHLE JE TA HLAVIČKA, KTEROU POSÍLÁ GITHUB PAGES. S ní se bez
       opravy v sw.js vrátí stará stránka z disku a na server se nejde. */
    res.setHeader('Cache-Control', 'max-age=600');
  } else if (cesta.endsWith('/sw.js')) {
    /* Nová verze webu = jiný obsah sw.js. Bez toho nemá prohlížeč co
       vyměnit a celý řetěz by se neměl od čeho odrazit. */
    telo = Buffer.from(String(telo) + '\n/* verze: ' + VERZE + ' */\n');
    res.setHeader('Cache-Control', 'no-cache');
  }
  res.writeHead(200, { 'Content-Type': TYPY[ext] || 'application/octet-stream' }).end(telo);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + PORT;

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));
/* DOTYK SE MUSÍ ŘÍCT. Okno 390 px je telefon a pravidla pro telefon
   má tenhle web za `@media (pointer: coarse)`, ne za šířkou — bez
   emulace dotyku by se měřilo něco, co na žádném telefonu neexistuje
   (hlídá scripts/test-zkousky-meri.mjs). */
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ' });
const p = await ctx.newPage();
await p.goto(BASE + '/index.html', { waitUntil: 'load' });
/* Obsluha se musí nejdřív chopit vesla: při PRVNÍM načtení se teprve
   instaluje a stránku ještě neřídí. Druhé načtení je ten běžný stav,
   ve kterém se web používá. */
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20000 })
  .catch(() => {});
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(1200);
const pred = await p.evaluate(() => ({
  verze: (document.getElementById('zk-verze') || {}).textContent,
  obsluha: !!navigator.serviceWorker.controller,
}));
pravda('obsluha webu řídí kartu (jinak není co zkoušet)', pred.obsluha);
pravda('a karta drží verzi, se kterou se otevřela', pred.verze === 'STARA', pred.verze);

VERZE = 'NOVA';                       // nasazení pod rukama běžící karty

/* Návrat ke kartě. Bezhlavý prohlížeč nepřepíná document.visibilityState,
   takže se posílá `focus` — jedna ze tří událostí, na které js/offline.js
   poslouchá (vedle visibilitychange a pageshow). Zkouší se tím ŘETĚZ za
   ní: dotaz na novou obsluhu → její výměna → překreslení karty. */
/* ČEKÁ SE NA NAČTENÍ, NE NA PODMÍNKU V STRÁNCE. waitForFunction vyhodnocuje
   svůj výraz UVNITŘ karty — jenže právě ta se pod ním překresluje, takže mu
   zmizí kontext a ohlásí chybu místo úspěchu. Naměřeno: řetěz proběhl
   správně a zkouška přesto hlásila „karta zůstala na STARA". Čeká se proto
   na načtení stránky zvenčí a teprve pak se čte značka. */
const nacteni = p.waitForNavigation({ waitUntil: 'load', timeout: 25000 }).catch(() => null);
await p.evaluate(() => window.dispatchEvent(new Event('focus'))).catch(() => {});
await nacteni;
const poPrekresleni = await p.evaluate(() => (document.getElementById('zk-verze') || {}).textContent)
  .catch(() => '(nepřečteno)');
const prekreslilo = poPrekresleni === 'NOVA';
pravda('po návratu ke kartě se stránka sama překreslí na novou verzi',
  prekreslilo, 'karta zůstala na ' + poPrekresleni);

/* A TEĎ TA DRUHÁ STRANA: BEZ NOVÉ VERZE SE NESMÍ STÁT NIC.
   Tohle je ta nebezpečná půlka. Kdyby se karta překreslovala při každém
   návratu, web by se člověku přeléval pod rukama — a kdo zrovna píše
   poznámku nebo má rozepsaný filtr, přijde o to. Nechává se proto
   běžet stejný návrat ještě dvakrát, ale SE STEJNOU verzí na serveru,
   a hlídá se, že se nic nenačte.
   (Že se po DALŠÍM nasazení karta překreslí znovu, je naopak správně:
   pojistka proti smyčce platí na jeden život stránky, a po každém
   překreslení začíná život nový.) */
if (prekreslilo) {
  let nacteniNavic = 0;
  const pocitadlo = () => { nacteniNavic++; };
  p.on('load', pocitadlo);
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => window.dispatchEvent(new Event('focus'))).catch(() => {});
    await p.waitForTimeout(2500);
  }
  p.off('load', pocitadlo);
  const drziSe = await p.evaluate(() => (document.getElementById('zk-verze') || {}).textContent)
    .catch(() => null);
  pravda('a dokud nová verze není, karta se nepřekresluje',
    nacteniNavic === 0 && drziSe === 'NOVA',
    `načtení navíc: ${nacteniNavic}, karta drží ${drziSe}`);
}

await ctx.close();
await prohlizec.close();
server.close();
console.log('\nNová verze v otevřené kartě');
console.log(zpravy.join('\n'));
console.log(`\n${zpravy.filter((z) => z.startsWith('  ✓')).length} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Nová verze v otevřené kartě: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
