import { chromium } from 'playwright-core';
const SC = process.env.SC;
const { BASE } = await import('./scripts/falesna-supabase-chat.mjs');
await new Promise(r => setTimeout(r, 300));
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const stranka = process.env.STR || 'cena-pozemku.html';
const jmeno = process.env.JM || 'str';
for (const w of (process.env.SIRKY || '390,1280').split(',').map(Number)) {
  const p = await b.newPage({ viewport: { width: w, height: 1200 }, deviceScaleFactor: 1 });
  await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); });
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: `${SC}/${jmeno}-${w}.png`, fullPage: true });
  const h = await p.evaluate(() => document.body.scrollHeight);
  console.log(`@${w}: ${jmeno} výška ${h}`);
  await p.close();
}
await b.close(); process.exit(0);
