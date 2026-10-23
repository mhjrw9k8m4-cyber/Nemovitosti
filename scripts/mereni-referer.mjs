/* MĚŘENÍ (ne zkouška): co prohlížeč pošle v hlavičce Referer na CIZÍ
 * server, když stránka žádný `<meta name="referrer">` nemá.
 * ====================================================================
 * Spuštění: PW_CHROMIUM=…/chrome node scripts/mereni-referer.mjs
 *
 * PROČ TO TU JE. Rozhodnutí „přidat Referrer-Policy, nebo ne" se dá
 * udělat dojmem, nebo měřením. Tohle je to měření: naše stránka na
 * jednom portu, „cizí server" na druhém, obrázek i fetch přes hranici
 * původu — a vypíše se, co cizí server dostal.
 * Výsledek z 23. 10. (Chromium 1194) stojí v docs/optimalizace.md,
 * oddíl 127: jen původ, bez cesty a bez dotazu. Proto se ta meta
 * nepřidala.
 *
 * NENÍ TO ZKOUŠKA a v CI schválně neběží: nic nehlídá, jen měří. Kdyby
 * se měnil hosting nebo vyšlo podezření, že se chování prohlížečů
 * změnilo, pustí se znovu.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';

const nase = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>z</title>
    <img src="http://127.0.0.1:8402/dlazdice.png" alt="">
    <script>fetch('http://127.0.0.1:8402/api', { mode: 'no-cors' });</script>`);
});
const prijato = [];
const cizi = createServer((req, res) => {
  prijato.push({ url: req.url, referer: req.headers.referer || '(žádný)' });
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); res.end('ok');
});
await new Promise((r) => nase.listen(8401, '127.0.0.1', r));
await new Promise((r) => cizi.listen(8402, '127.0.0.1', r));

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:8401/stranka.html?tajny=parametr#fragment');
await p.waitForTimeout(800);
await b.close(); nase.close(); cizi.close();
console.log('verze prohlížeče: ' + (process.env.PW_CHROMIUM || '').split('/').slice(-3)[0]);
for (const z of prijato) console.log(`  ${z.url}  →  Referer: ${z.referer}`);
