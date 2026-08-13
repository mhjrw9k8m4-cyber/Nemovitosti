#!/usr/bin/env node
// SPÚ přehled celé ČR — je to kompletní seznam nabídek §12 (prodej pozemků)?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
for (const path of ['/nabidky/prehled-cela-cr', '/nabidky/prehled-terminu']) {
  const r = await get('https://spu.gov.cz' + path);
  console.log(`\n=== ${path} → ${r.s} ${r.ct} ${r.t.length}B ===`);
  const t = r.t; if (!t) continue;
  console.log('tabulky:', (t.match(/<table/gi) || []).length, '| tr:', (t.match(/<tr/gi) || []).length, '| JS app:', /id="root"|__NUXT__/.test(t));
  // POST varianta pro typ paragraf7 (prodej §12)
  for (const kw of ['paragraf7', '§ 12', 'prodej', 'getNabidky', 'getPrehled', 'ajax', '$.post', '$.get', 'load(']) {
    const i = t.indexOf(kw); if (i >= 0) console.log(`  "${kw}" @${i}: …${t.slice(i - 30, i + 90).replace(/\s+/g, ' ')}…`);
  }
}

// zkusíme POST na prehled s typem prodeje §12
console.log('\n-- POST varianty pro §12 (paragraf7) --');
for (const [ep, body] of [
  ['/nabidky/prehled-cela-cr', 'typ_nabidky=paragraf7'],
  ['/nabidky/getPrehledCR', 'typ_nabidky=paragraf7'],
  ['/nabidky/getNabidkyCR', 'typ_nabidky=paragraf7'],
  ['/nabidky/getNabidky', 'typ_nabidky=paragraf7&okres=&ku=&datum='],
]) {
  const r = await get('https://spu.gov.cz' + ep, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }, body });
  let info = r.t.slice(0, 100).replace(/\s+/g, ' ');
  try { const j = JSON.parse(r.t); info = 'JSON délky ' + (Array.isArray(j) ? j.length : '?') + ' :: ' + JSON.stringify(Array.isArray(j) ? j[0] : j).slice(0, 260); } catch {}
  console.log(`${ep} [${body}] → ${r.s} ${r.t.length}B :: ${info}`);
}
console.log('\nHotovo.');
