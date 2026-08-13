#!/usr/bin/env node
// SPÚ /nabidky — je to serverově vykreslený seznam prodejů státní půdy?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u) {
  try { const r = await fetch(u, { headers: UA, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
for (const path of ['/nabidky', '/nabidka-nepotrebneho-majetku']) {
  const r = await get('https://spu.gov.cz' + path);
  console.log(`\n=== ${path} → ${r.s} ${r.ct} ${r.t.length}B ===`);
  if (!r.t) continue;
  console.log('tabulky:', (r.t.match(/<table/gi) || []).length, '| tr:', (r.t.match(/<tr/gi) || []).length, '| JS app:', /id="root"|__NUXT__|__NEXT_DATA__/.test(r.t));
  // odkazy na detaily nabídek + zmínky pozemek/parc/výměra
  const links = [...new Set([...r.t.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]).filter((h) => /nabid|prode|pozemk|detail|zamer|katalog|dokument/i.test(h)))].slice(0, 20);
  console.log('odkazy:', JSON.stringify(links, null, 0));
  for (const kw of ['pozemek', 'parc', 'výměr', 'm2', 'okres', 'katastr', 'Kč', 'nabídkové řízení', 'prodej']) {
    const i = r.t.indexOf(kw); if (i >= 0) console.log(`  "${kw}" @${i}: …${r.t.slice(i - 10, i + 70).replace(/\s+/g, ' ')}…`);
  }
  // odkaz na strojová data (xlsx/csv/xml/pdf seznamy)
  const files = [...new Set([...r.t.matchAll(/href="([^"]+\.(?:xlsx?|csv|xml|json|pdf))"/gi)].map((m) => m[1]))].slice(0, 15);
  console.log('soubory:', JSON.stringify(files, null, 0));
}
console.log('\nHotovo.');
