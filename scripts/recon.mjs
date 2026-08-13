#!/usr/bin/env node
// Najdi datový (AJAX) odkaz nabidkamajetku.cz (ÚZSVM, ASP.NET MVC).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

const home = await get('https://nabidkamajetku.cz/');
console.log('home:', home.s, home.t.length + 'B');
// 1) script soubory
const scripts = [...new Set([...home.t.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))];
console.log('scripts:', JSON.stringify(scripts));
// 2) inline JS: hledáme ajax url / controller akce
const urlHits = [...new Set([...home.t.matchAll(/(?:url\s*:\s*|ajax\(\s*["'`]|getJSON\(\s*["'`]|fetch\(\s*["'`])["'`]?([^"'`\s,)]+)/gi)].map((m) => m[1]))].slice(0, 20);
console.log('inline url hity:', JSON.stringify(urlHits));
const homeActions = [...new Set([...home.t.matchAll(/["'`](\/(?:Home|Nabidka|Majetek|Search|Api)\/[A-Za-z0-9_]+)["'`]/g)].map((m) => m[1]))].slice(0, 20);
console.log('controller akce:', JSON.stringify(homeActions));

// 3) prohledej i externí skripty (jen naše doména)
for (const s of scripts.filter((s) => !/^https?:\/\//.test(s) || /nabidkamajetku/.test(s)).slice(0, 4)) {
  const u = s.startsWith('http') ? s : 'https://nabidkamajetku.cz' + (s.startsWith('/') ? s : '/' + s);
  const js = await get(u);
  const hits = [...new Set([...js.t.matchAll(/["'`](\/(?:Home|Nabidka|Majetek|Search|Api)\/[A-Za-z0-9_]+)["'`]/g)].map((m) => m[1]))].slice(0, 15);
  const ajaxUrls = [...new Set([...js.t.matchAll(/url\s*:\s*["'`]([^"'`]+)["'`]/gi)].map((m) => m[1]))].slice(0, 15);
  console.log(`\n-- ${u} (${js.s}, ${js.t.length}B) --`);
  console.log('  akce:', JSON.stringify(hits));
  console.log('  ajax url:', JSON.stringify(ajaxUrls));
}

// 4) přímé tipy na ASP.NET akce vracející seznam
console.log('\n-- tipy na seznam --');
for (const p of ['/Home/GetData', '/Home/List', '/Home/Search', '/Home/Items', '/Home/GetNabidky', '/Home/Data', '/Home/Index?handler=Data', '/Nabidka/List']) {
  const r = await get('https://nabidkamajetku.cz' + p);
  console.log(p, '→', r.s, r.ct, (r.t || '').length + 'B', (r.t || '').slice(0, 70).replace(/\s+/g, ' '));
}
console.log('\nHotovo.');
