#!/usr/bin/env node
// CEVD: jak odkázat na konkrétní dražbu? (detail web + pole drazebnik/podrobnosti)
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

// 1) homepage evidence dražeb — je to JS app? jaké odkazy/skripty?
const home = await get('https://cevd.gov.cz/');
console.log('cevd.gov.cz:', home.s, home.t.length + 'B');
console.log('CELÝ HTML:\n', home.t.slice(0, 2000));

// 2) záznam dražby: drazebnik.url + podrobnostiODrazbe (hledám odkaz na dražbu)
console.log('\n=== pole záznamu (drazebnik, konani, podrobnosti) ===');
try {
  const y = new Date().getFullYear();
  const data = await (await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA })).json();
  const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  const rec = arr.find((r) => (r.predmetyDrazby || []).some((p) => p.stavPredmetu === 'Uveřejněno')) || arr[0];
  const zi = rec.zakladniInformace || {};
  console.log('cisloDrazby:', zi.cisloDrazby, '| formaDrazby:', zi.formaDrazby, '| zpusobDrazby:', zi.zpusobDrazby);
  console.log('drazebnik:', JSON.stringify(zi.drazebnik).slice(0, 400));
  console.log('konaniDrazby:', JSON.stringify(zi.konaniDrazby).slice(0, 300));
  console.log('podrobnostiODrazbe klíče:', JSON.stringify(Object.keys(rec.podrobnostiODrazbe || {})));
  console.log('podrobnosti (url pole):', JSON.stringify([...new Set([...JSON.stringify(rec.podrobnostiODrazbe || {}).matchAll(/"(\w*url\w*)":\s*("[^"]*")/gi)].map((m) => m[1] + '=' + m[2]))]));
} catch (e) { console.log('chyba:', e.message); }

// 3) zkusíme detail na cevd.gov.cz podle čísla dražby
console.log('\n=== detail tipy ===');
for (const u of [
  'https://cevd.gov.cz/detail/CEVD-2026-000001',
  'https://cevd.gov.cz/drazba/CEVD-2026-000001',
  'https://cevd.gov.cz/?cisloDrazby=CEVD-2026-000001',
  'https://cevd.gov.cz/verejnost/detail/CEVD-2026-000001',
]) {
  const r = await get(u);
  console.log(u.replace('https://cevd.gov.cz', ''), '→', r.s, (r.t || '').length + 'B', /CEVD-2026|dražb/i.test(r.t) ? '(zmiňuje dražbu)' : '');
}
console.log('\nHotovo.');
