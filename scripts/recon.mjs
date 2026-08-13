#!/usr/bin/env node
// Hledáme DALŠÍ legální zdroje inzerátů pozemků (robots.txt povoluje + API/RSS/sitemap).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow', ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
function robotsVerdict(t) {
  // najdi blok "User-agent: *" a jeho Disallow
  const lines = t.split(/\r?\n/).map((l) => l.trim());
  let inStar = false, dis = [], allowRoot = false, blockAll = false;
  for (const l of lines) {
    const m = l.match(/^user-agent:\s*(.+)/i);
    if (m) { inStar = m[1].trim() === '*'; continue; }
    if (!inStar) continue;
    const d = l.match(/^disallow:\s*(.*)/i);
    if (d) { const p = d[1].trim(); dis.push(p); if (p === '/') blockAll = true; }
    if (/^allow:\s*\/\s*$/i.test(l)) allowRoot = true;
  }
  return { blockAll, allowRoot, disallowCount: dis.length, sample: dis.slice(0, 6) };
}

const sites = [
  ['reality.idnes.cz', 'https://reality.idnes.cz'],
  ['farmy.cz', 'https://www.farmy.cz'],
  ['annonce.cz', 'https://www.annonce.cz'],
  ['hyperinzerce.cz', 'https://reality.hyperinzerce.cz'],
  ['realingo.cz', 'https://www.realingo.cz'],
  ['ceskereality.cz', 'https://www.ceskereality.cz'],
];

for (const [name, base] of sites) {
  const rob = await get(base + '/robots.txt');
  const v = rob.s === 200 ? robotsVerdict(rob.t) : { err: rob.s };
  console.log(`\n=== ${name} ===`);
  console.log('robots:', JSON.stringify(v));
  if (/sitemap:/i.test(rob.t)) {
    const sm = (rob.t.match(/sitemap:\s*(\S+)/i) || [])[1];
    console.log('sitemap:', sm);
  }
  // rychlé tipy na feed/API
  for (const p of ['/rss', '/api', '/export']) {
    const r = await get(base + p);
    if (r.s && r.s !== 404) console.log(' ', p, '→', r.s, r.ct, (r.t || '').length + 'B', /<item>|<rss|json/i.test(r.t) ? '(feed?)' : '');
  }
}
console.log('\nHotovo.');
