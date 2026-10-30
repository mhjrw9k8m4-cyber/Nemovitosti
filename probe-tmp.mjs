import { chromium } from 'playwright-core';
const { BASE } = await import('./scripts/falesna-supabase-chat.mjs');
await new Promise(r=>setTimeout(r,300));
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, bypassCSP:true });
const p = await ctx.newPage();
await p.goto(BASE + '/index.html', { waitUntil:'load' });
await p.waitForTimeout(3500);
const m = await p.evaluate(() => {
  const q = (s) => { const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    return `${Math.round(r.width)}×${Math.round(r.height)} sw=${cs.strokeWidth}`; };
  return {
    lupa: q('.mcp-hledani .ms-lupa'),
    prepinacIk: q('.mv-toggle .mvt-btn.active svg'),
    rychlyIk: q('#mc-rychly .mcn-ic svg'),
    vyvozIk: q('#mc-vyvoz .mcn-ic svg'),
    poleH: q('.mcp-hledani #map-search'),
    prepinacH: q('.mcp-hledani .mv-toggle'),
  };
});
console.log(JSON.stringify(m, null, 1));
await b.close(); process.exit(0);
