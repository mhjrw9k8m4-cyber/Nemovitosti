#!/usr/bin/env node
// Kde jsou data v nabidkamajetku.cz? Tabulka v HTML, nebo JSON blob v <script>?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const r = await fetch('https://nabidkamajetku.cz/', { headers: UA });
const t = await r.text();
console.log('home:', r.status, t.length + 'B');

// 1) tabulky a řádky
console.log('počet <table>:', (t.match(/<table/gi) || []).length);
console.log('počet <tr>:', (t.match(/<tr/gi) || []).length);
console.log('počet data-* atributů:', (t.match(/\sdata-[a-z-]+=/gi) || []).length);

// 2) JSON bloky v <script> (application/json nebo přiřazení proměnné)
const jsonScripts = [...t.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
console.log('application/json scriptů:', jsonScripts.length);
jsonScripts.slice(0, 3).forEach((s, i) => console.log(`  [${i}] ${s.slice(0, 160).replace(/\s+/g, ' ')}`));

// 3) přiřazení proměnné s polem (var X = [ ... ]) — hledáme velké pole
const varArrays = [...t.matchAll(/(?:var|let|const)\s+(\w+)\s*=\s*(\[[\s\S]{40,}?\]);/g)]
  .map((m) => ({ name: m[1], len: m[2].length, head: m[2].slice(0, 120).replace(/\s+/g, ' ') }));
console.log('var = [..] pole:', JSON.stringify(varArrays.slice(0, 8)));

// 4) hledej klíčová slova okolo dat
for (const kw of ['pozemek', 'parc', 'Properties', 'dataSrc', 'ajax', 'aaData', '"data"', 'okres', 'Kč', 'm²', 'm2']) {
  const idx = t.indexOf(kw);
  if (idx >= 0) console.log(`"${kw}" @${idx}: …${t.slice(idx - 20, idx + 90).replace(/\s+/g, ' ')}…`);
  else console.log(`"${kw}": nenalezeno`);
}
console.log('\nHotovo.');
