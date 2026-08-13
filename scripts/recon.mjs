#!/usr/bin/env node
// Které inzertní portály dovolují legální/bezplatný strojový přístup?
// Kontrolujeme robots.txt + existenci oficiálního API/RSS pro pozemky.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
function robotsSummary(t) {
  // vytáhneme řádky Disallow/Allow a zmínku o api/rss
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(user-agent|disallow|allow|sitemap)/i.test(l));
  return lines.slice(0, 25);
}

// 1) Sreality — veřejné JSON API (category_main_cb=3 = pozemky)
console.log('=== SREALITY ===');
{
  const rob = await get('https://www.sreality.cz/robots.txt');
  console.log('robots.txt:', rob.s, JSON.stringify(robotsSummary(rob.t)));
  const api = await get('https://www.sreality.cz/api/cs/v2/estates?category_main_cb=3&per_page=2&tms=1', { headers: { accept: 'application/json' } });
  console.log('API pozemky:', api.s, api.ct, api.t.length + 'B');
  try { const j = JSON.parse(api.t); const est = (j._embedded && j._embedded.estates) || []; console.log('  počet:', j.result_size, '| ukázka:', JSON.stringify(est[0] && { name: est[0].name, locality: est[0].locality, price: est[0].price }).slice(0, 200)); } catch { console.log('  (nelze načíst JSON):', api.t.slice(0, 120).replace(/\s+/g, ' ')); }
}

// 2) Bazoš — RSS feed pro reality/pozemky
console.log('\n=== BAZOŠ ===');
{
  const rob = await get('https://reality.bazos.cz/robots.txt');
  console.log('robots.txt:', rob.s, JSON.stringify(robotsSummary(rob.t)));
  for (const u of ['https://reality.bazos.cz/rss.php?hledat=pozemek&rubriky=reality&kat=105',
    'https://www.bazos.cz/rss.php?rubriky=reality&hledat=pozemek']) {
    const r = await get(u);
    console.log('RSS', u.slice(0, 55), '→', r.s, r.ct, r.t.length + 'B', /<item>/i.test(r.t) ? '(má <item>)' : '(bez item)');
  }
}

// 3) Bezrealitky — API
console.log('\n=== BEZREALITKY ===');
{
  const rob = await get('https://www.bezrealitky.cz/robots.txt');
  console.log('robots.txt:', rob.s, JSON.stringify(robotsSummary(rob.t)));
  const api = await get('https://api.bezrealitky.cz/', { headers: { accept: 'application/json' } });
  console.log('api root:', api.s, api.ct, api.t.slice(0, 100).replace(/\s+/g, ' '));
}

// 4) Sbazar (Seznam)
console.log('\n=== SBAZAR ===');
{
  const rob = await get('https://www.sbazar.cz/robots.txt');
  console.log('robots.txt:', rob.s, JSON.stringify(robotsSummary(rob.t)));
}
console.log('\nHotovo.');
