#!/usr/bin/env node
// (1) CEVD: najdi ID/odkaz na detail dražby.  (2) obec: feasibility úředních desek.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

// ---------- CEVD: struktura záznamu dražby ----------
console.log('=== CEVD: pole záznamu dražby (hledám ID/odkaz) ===');
try {
  const y = new Date().getFullYear();
  const data = await (await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA })).json();
  const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  const rec = arr.find((r) => (r.predmetyDrazby || []).some((p) => p.stavPredmetu === 'Uveřejněno')) || arr[0];
  console.log('klíče záznamu:', JSON.stringify(Object.keys(rec)));
  console.log('klíče zakladniInformace:', JSON.stringify(Object.keys(rec.zakladniInformace || {})));
  // vypiš všechna pole vypadající jako id/číslo/url
  const flat = JSON.stringify(rec);
  const idFields = [...new Set([...flat.matchAll(/"(\w*(?:[iI]d|[cČ]islo|[uU]rl|odkaz|evidencni|spisov)\w*)":\s*("?[^",{}\[\]]+"?)/g)].map((m) => m[1] + '=' + m[2]))].slice(0, 25);
  console.log('id/číslo/url pole:', JSON.stringify(idFields, null, 0));
} catch (e) { console.log('CEVD chyba:', e.message); }

// zkusíme, jestli má CEVD veřejný detail (podle evidenčního čísla)
console.log('\n=== CEVD detail web ===');
for (const u of ['https://cevd.gov.cz/', 'https://www.centralniadresa.cz/']) {
  const r = await get(u);
  console.log(u, '→', r.s, r.ct, (r.t || '').length + 'B', (r.t || '').slice(0, 80).replace(/\s+/g, ' '));
}

// ---------- OBEC: národní úřední desky (open data) ----------
console.log('\n=== OBEC: úřední desky přes NKOD/OFN ===');
// registr úředních desek – seznam desek v OFN
for (const u of [
  'https://data.gov.cz/zdroj/lokální-katalogy',
  'https://portal.gov.cz/rozhrani-pro-cteni-udaju/uredni-desky',
  'https://opendata.gov.cz/datové-sady:úřední-deska',
]) {
  const r = await get(u, { headers: { accept: 'application/json' } });
  console.log(u.slice(0, 55), '→', r.s, r.ct, (r.t || '').length + 'B');
}
console.log('\nHotovo.');
