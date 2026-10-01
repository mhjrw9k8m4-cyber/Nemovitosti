// Sonda: snímky úvodní stránky po obrazovkách, ať je vidět, kde je mrtvá.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
const OUT = process.env.OUT || '/tmp/snimky';
mkdirSync(OUT, { recursive: true });
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const b = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const W = Number(process.env.W || 1280), H = Number(process.env.H || 900);
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return LEAFLET ? r.abort() : r.continue();
});
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html*`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
}
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4500);
const vyska = await p.evaluate(() => document.documentElement.scrollHeight);
const obrazovek = Math.min(10, Math.ceil(vyska / H));
console.log(`stránka ${vyska} px = ${obrazovek} obrazovek po ${H} px (šířka ${W})`);
for (let i = 0; i < obrazovek; i++) {
  await p.evaluate((y) => window.scrollTo(0, y), i * H);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/w${W}-${String(i + 1).padStart(2, '0')}.png` });
}
// a k tomu, co je v které obrazovce za oddíl
const oddily = await p.evaluate(() => [...document.querySelectorAll('main > section, main > div[id]')]
  .map((e) => ({ id: e.id || e.className.split(' ')[0], y: Math.round(e.getBoundingClientRect().top + window.scrollY), h: Math.round(e.getBoundingClientRect().height) })));
console.log(oddily.map((o) => `  ${String(o.y).padStart(6)} +${String(o.h).padStart(5)}  ${o.id}`).join('\n'));
await b.close(); process.exit(0);
