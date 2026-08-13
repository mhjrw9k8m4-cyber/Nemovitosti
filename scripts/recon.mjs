#!/usr/bin/env node
// Který CSV je §12 prodej? Vypiš všechny CSV odkazy s popiskem + syrové sloupce.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const page = await (await fetch('https://spu.gov.cz/nabidky/prehled-cela-cr', { headers: UA })).text();

// všechny odkazy na .csv s okolním textem (label)
const links = [...page.matchAll(/<a[^>]+href="([^"]+\.csv)"[^>]*>([\s\S]*?)<\/a>/gi)]
  .map((m) => [m[1], m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()]);
console.log('CSV odkazy s popiskem:');
links.forEach(([u, l]) => console.log('  •', l, '→', u));

// kontext kolem každého .csv (širší, ať vidíme nadpis sekce)
for (const m of page.matchAll(/([^;<>]{0,90})href="[^"]*\/([a-z0-9]+\d{4}-\d\d-\d\d\.csv)"/gi)) {
  console.log('  ctx:', m[1].replace(/\s+/g, ' ').trim(), '=>', m[2]);
}

// stáhni pozemky CSV a vypiš syrové sloupce prvních 3 řádků
const csv = links.find(([u]) => /pozemky/i.test(u));
if (csv) {
  let url = csv[0].startsWith('http') ? csv[0] : 'https://spu.gov.cz' + csv[0];
  const buf = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
  const txt = new TextDecoder('windows-1250').decode(buf);
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  console.log(`\npozemky CSV: ${url}\nHLAVIČKA:`, JSON.stringify(lines[0].split(';')));
  for (let i = 1; i <= 3 && i < lines.length; i++) {
    const c = lines[i].split(';');
    console.log(`řádek ${i} (${c.length} sl.):`, JSON.stringify(c.map((x, j) => j + ':' + x)));
  }
}
console.log('\nHotovo.');
