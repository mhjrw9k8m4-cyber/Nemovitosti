// Sonda: zapamatuje si web pozemky, které jsem otevřel?
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAAC0lEQVR4nGNgAAIAAAUAAWJVMogAAAAASUVORK5CYII=', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const b = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
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
  for (const c of ['index.html']) {
    await ctx.route(`${BASE}/${c}*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
}
const p = await ctx.newPage();
async function uvod() { await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3800); }
await uvod();
for (let i = 0; i < 3; i++) {
  await uvod();
  const karty = await p.$$('.opp-item');
  if (karty.length <= i) { console.log('málo karet'); break; }
  const obec = await karty[i].evaluate((e) => (e.querySelector('.opp-place') || {}).textContent);
  await karty[i].click();
  await p.waitForTimeout(1400);
  console.log(`otevřel jsem ${i + 1}. kartu („${String(obec).trim()}") → ${new URL(p.url()).pathname}`);
}
await uvod();
const v = await p.evaluate(() => {
  const el = document.getElementById('recent-strip');
  let ulozeno = null; try { ulozeno = JSON.parse(localStorage.getItem('pk_recent_v1') || 'null'); } catch (e) {}
  return { ulozeno, jeVidet: !!(el && !el.hidden && el.offsetParent !== null),
    cipu: el ? el.querySelectorAll('.rs-chip').length : -1,
    vyska: el ? Math.round(el.getBoundingClientRect().height) : -1 };
});
console.log('pk_recent_v1 v úložišti:', JSON.stringify(v.ulozeno));
console.log(`pruh „Naposledy prohlédnuté": vidět ${v.jeVidet}, čipů ${v.cipu}, vysoký ${v.vyska} px`);
await b.close(); process.exit(0);
