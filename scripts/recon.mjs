#!/usr/bin/env node
// Najde v oficiálním datasetu dražeb první POZEMEK a vypíše jeho strukturu.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const r = await fetch('https://cevd.gov.cz/opendata/drazby/drazby_2026.json', { headers: UA });
const j = await r.json();
const arr = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || []);
console.log('Počet dražeb:', arr.length);
console.log('Klíče záznamu:', Object.keys(arr[0]).join(', '));

function isLand(p) {
  const s = JSON.stringify(p).toLowerCase();
  return s.includes('pozem') || s.includes('parcel');
}

let found = 0;
for (const rec of arr) {
  const predmety = rec.predmetyDrazby || rec.predmety || [];
  const land = predmety.find(isLand);
  if (!land) continue;
  found++;
  if (found === 1) {
    console.log('\n=== PRVNÍ DRAŽBA S POZEMKEM — horní úroveň ===');
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      console.log(k, '→', typeof v === 'object' ? (Array.isArray(v) ? '[' + v.length + ']' : Object.keys(v || {}).join('/')) : JSON.stringify(v));
    }
    console.log('\n=== PŘEDMĚT (POZEMEK) — celý ===');
    console.log(JSON.stringify(land, null, 2).slice(0, 4500));
  }
  if (found >= 3 && found <= 5) {
    const nazev = (land.veci && land.veci[0] && land.veci[0].nazev) || land.nazevPredmetu;
    console.log(`\n--- další pozemek #${found}: ${nazev}`);
  }
}
console.log('\nDražeb s pozemkem:', found, 'z', arr.length);
console.log('Hotovo.');
