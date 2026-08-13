#!/usr/bin/env node
// SPÚ CSV nabídek pozemků — najdi odkaz na přehledu a rozeber sloupce.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const page = await (await fetch('https://spu.gov.cz/nabidky/prehled-cela-cr', { headers: UA })).text();
const csvLinks = [...new Set([...page.matchAll(/href="([^"]+\.csv)"/gi)].map((m) => m[1]))];
console.log('CSV odkazy:', JSON.stringify(csvLinks));

for (const rel of csvLinks.slice(0, 4)) {
  // normalizace /frontend/webroot/../../X → /X
  let url = rel.startsWith('http') ? rel : 'https://spu.gov.cz' + rel;
  const r = await fetch(url, { headers: UA });
  const buf = Buffer.from(await r.arrayBuffer());
  // zkusíme UTF-8 i Windows-1250
  let txt = buf.toString('utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  console.log(`\n=== ${url} → ${r.status} ${buf.length}B · ${lines.length} řádků ===`);
  console.log('oddělovač?', (lines[0].match(/;/g) || []).length, 'středníků vs', (lines[0].match(/,/g) || []).length, 'čárek');
  lines.slice(0, 4).forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 300)}`));
}
console.log('\nHotovo.');
