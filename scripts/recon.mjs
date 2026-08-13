#!/usr/bin/env node
// edesky.cz — agregátor úředních desek. Má API/hledání na "záměr prodeje pozemku"?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

const rob = await get('https://edesky.cz/robots.txt');
console.log('robots.txt:', rob.s, JSON.stringify(rob.t.slice(0, 300)));

// API? edesky historicky mělo veřejné API (api.edesky.cz)
console.log('\n-- API tipy --');
for (const u of [
  'https://edesky.cz/api/v1/documents?query=z%C3%A1m%C4%9Br+prodej+pozemek',
  'https://api.edesky.cz/api/v1/documents?query=prodej+pozemku',
  'https://edesky.cz/api',
  'https://edesky.cz/api_v1',
  'https://edesky.cz/documents.json?q=prodej+pozemku',
]) {
  const r = await get(u, { headers: { accept: 'application/json' } });
  console.log(u.replace('https://', '').slice(0, 55), '→', r.s, r.ct, (r.t || '').length + 'B', (r.t || '').slice(0, 80).replace(/\s+/g, ' '));
}

// hledání přes web (HTML) — najdeme formát dokumentů
console.log('\n-- webové hledání --');
const s = await get('https://edesky.cz/vyhledavani?text=z%C3%A1m%C4%9Br+prodeje+pozemku');
console.log('search:', s.s, s.t.length + 'B', /dokument|zám[ěe]r|pozem/i.test(s.t) ? '(má výsledky?)' : '');
const links = [...new Set([...s.t.matchAll(/href="(\/dokument[^"]*)"/gi)].map((m) => m[1]))].slice(0, 6);
console.log('odkazy na dokumenty:', JSON.stringify(links));
console.log('\nHotovo.');
