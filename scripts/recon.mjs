#!/usr/bin/env node
// SPÚ prehled-cela-cr / prehled-terminu — struktura řádků tabulky (sloupce).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
function cells(rowHtml) {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
}
for (const path of ['/nabidky/prehled-cela-cr', '/nabidky/prehled-terminu']) {
  const t = await (await fetch('https://spu.gov.cz' + path, { headers: UA })).text();
  const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => cells(m[1])).filter((c) => c.length > 1);
  console.log(`\n=== ${path} → ${t.length}B · ${rows.length} řádků ===`);
  rows.slice(0, 8).forEach((c, i) => console.log(`  [${i}] (${c.length}) ${JSON.stringify(c).slice(0, 260)}`));
  // detekce odkazů na detail v řádcích
  const det = [...new Set([...t.matchAll(/href="([^"]*(?:detail|nabidk)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 5);
  console.log('  detail odkazy:', JSON.stringify(det));
}
console.log('\nHotovo.');
